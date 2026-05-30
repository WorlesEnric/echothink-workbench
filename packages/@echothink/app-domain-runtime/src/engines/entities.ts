import type { CompiledManifest, NormalizedEntity } from "@echothink/domain-manifest";

import type {
  Clock,
  EntityQueryOptions,
  EntityStore,
  IdGenerator,
  RuntimeContext,
} from "../adapters.js";
import { sdkError } from "../errors.js";
import type { AuditEngine } from "./audit.js";
import type { PermissionEngine } from "./permissions.js";

export interface EntityGateway {
  query(
    ctx: RuntimeContext,
    queryId: string,
    args?: unknown,
  ): Promise<Record<string, unknown>[]>;
  get(
    ctx: RuntimeContext,
    entity: string,
    id: string,
  ): Promise<Record<string, unknown> | null>;
}

export class DefaultEntityGateway implements EntityGateway {
  constructor(
    private readonly compiled: CompiledManifest,
    private readonly store: EntityStore,
    private readonly permissionEngine: PermissionEngine,
    private readonly audit: AuditEngine,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async query(
    ctx: RuntimeContext,
    queryId: string,
    args?: unknown,
  ): Promise<Record<string, unknown>[]> {
    const query = this.compiled.manifest.queries[queryId];
    if (!query) {
      throw sdkError("not_found", `Query "${queryId}" was not found.`, {
        queryId,
      });
    }

    const entity = this.entityFor(query.entity);
    this.assertAllowed(ctx, "entity.query", queryId);

    const { filter, opts } = this.buildQueryRequest(
      entity,
      queryId,
      ctx.tenantId,
      args,
    );
    const rows = await this.store.query(entity.name, filter, opts);
    await this.auditRead(ctx, entity, "entity.query", queryId, {
      queryId,
      input: args,
      filter,
    });
    return rows.map(cloneRecord);
  }

  async get(
    ctx: RuntimeContext,
    entityNameOrKey: string,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const entity = this.entityFor(entityNameOrKey);
    this.assertAllowed(ctx, "entity.get", entity.name);

    const tenantId =
      entity.tenantScope === "organization" ? ctx.tenantId : undefined;
    const record = await this.store.get(entity.name, id, { tenantId });
    const scopedRecord = this.recordMatchesTenant(ctx, entity, record)
      ? record
      : null;

    await this.auditRead(ctx, entity, "entity.get", entity.name, { id });
    return scopedRecord ? cloneRecord(scopedRecord) : null;
  }

  private buildQueryRequest(
    entity: NormalizedEntity,
    queryId: string,
    tenantId: string,
    args: unknown,
  ): { filter: Record<string, unknown>; opts: EntityQueryOptions } {
    const query = this.compiled.manifest.queries[queryId];
    if (!query) {
      throw sdkError("not_found", `Query "${queryId}" was not found.`);
    }

    const argRecord = isRecord(args) ? args : {};
    const directFilter = Object.fromEntries(
      Object.entries(argRecord).filter(
        ([key]) =>
          !["filter", "sortBy", "sortDirection", "limit", "offset"].includes(
            key,
          ),
      ),
    );
    const nestedFilter = isRecord(argRecord.filter) ? argRecord.filter : {};
    const filter: Record<string, unknown> = {
      ...directFilter,
      ...nestedFilter,
      ...(query.filter ?? {}),
    };
    if (entity.tenantScope === "organization") {
      filter.tenantId = tenantId;
    }

    const sortBy =
      typeof argRecord.sortBy === "string" &&
      (query.sortableBy ?? []).includes(argRecord.sortBy)
        ? argRecord.sortBy
        : undefined;
    const sortDirection =
      argRecord.sortDirection === "desc" || argRecord.sortDirection === "asc"
        ? argRecord.sortDirection
        : undefined;
    const limit = typeof argRecord.limit === "number" ? argRecord.limit : undefined;
    const offset =
      typeof argRecord.offset === "number" ? argRecord.offset : undefined;

    return {
      filter,
      opts: {
        ...(entity.tenantScope === "organization" ? { tenantId } : {}),
        ...(sortBy ? { sortBy } : {}),
        ...(sortDirection ? { sortDirection } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
      },
    };
  }

  private assertAllowed(
    ctx: RuntimeContext,
    capability: "entity.query" | "entity.get",
    target: string,
  ): void {
    const decision = this.permissionEngine.can(ctx.roles, capability, target);
    if (!decision.allowed) {
      throw sdkError(
        "permission_denied",
        `Actor is not allowed to ${capability} ${target}.`,
        { capability, target, reason: decision.reason },
      );
    }
  }

  private async auditRead(
    ctx: RuntimeContext,
    entity: NormalizedEntity,
    capability: "entity.query" | "entity.get",
    target: string,
    input: unknown,
  ): Promise<void> {
    await this.audit.append(
      {
        id: this.ids.next("audit"),
        ts: this.clock.now(),
        actorId: ctx.actorId,
        tenantId: ctx.tenantId,
        domainId: ctx.domainId,
        ...(ctx.surfaceId ? { surfaceId: ctx.surfaceId } : {}),
        capability,
        target,
        result: "ok",
        redactedInput: input,
      },
      entity.audit?.read ?? "none",
    );
  }

  private recordMatchesTenant(
    ctx: RuntimeContext,
    entity: NormalizedEntity,
    record: Record<string, unknown> | null,
  ): record is Record<string, unknown> {
    if (!record) {
      return false;
    }
    if (entity.tenantScope !== "organization") {
      return true;
    }
    return record.tenantId === ctx.tenantId;
  }

  private entityFor(entityNameOrKey: string): NormalizedEntity {
    const entity = this.compiled.normalizedEntities.find(
      (candidate) =>
        candidate.name === entityNameOrKey || candidate.key === entityNameOrKey,
    );
    if (!entity) {
      throw sdkError("not_found", `Entity "${entityNameOrKey}" was not found.`, {
        entity: entityNameOrKey,
      });
    }
    return entity;
  }
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
