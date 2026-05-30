import type {
  EffectImpl,
  EffectStub,
  SdkError,
  SdkRequest,
  SdkResponse,
  Transport,
} from "@echothink/app-domain-sdk";
import type { CompiledManifest } from "@echothink/domain-manifest";
import type { Environment } from "@echothink/shared-types";

import type {
  AuditRecord,
  AuditSink,
  Clock,
  EmittedEvent,
  EntityQueryOptions,
  EntityStore,
  IdGenerator,
  SecretResolver,
} from "../adapters.js";
import type { PermissionDecision } from "../engines/permissions.js";
import {
  createRuntime,
  type DomainRuntime,
} from "../runtime.js";

export interface Persona {
  id: string;
  role: string;
  tenantId: string;
  label?: string;
  invalid?: boolean;
}

export interface PreviewRuntime extends Transport {
  setPersona(id: string): void;
  inspectAudit(): AuditRecord[];
  inspectEvents(): EmittedEvent[];
  explainPermission(capability: string, target: string): PermissionDecision;
  forceFailure(kind: "permission" | "effect" | "runtime" | null): void;
  reset(): void;
}

export interface CreatePreviewRuntimeOptions {
  compiled: CompiledManifest;
  fixtures: {
    personas: readonly Persona[];
    entities: Record<string, readonly Record<string, unknown>[]>;
    effectStubs: readonly EffectStub<unknown, unknown>[];
  };
  activePersonaId: string;
  clock: Clock;
  ids: IdGenerator;
  env?: Environment;
}

export function createPreviewRuntime(
  opts: CreatePreviewRuntimeOptions,
): PreviewRuntime {
  return new DefaultPreviewRuntime(opts);
}

class DefaultPreviewRuntime implements PreviewRuntime {
  private activePersonaId: string;
  private forcedFailure: "permission" | "effect" | "runtime" | null = null;
  private entityStore: InMemoryEntityStore;
  private auditSink: InMemoryAuditSink;
  private runtime: DomainRuntime;

  constructor(private readonly opts: CreatePreviewRuntimeOptions) {
    this.activePersonaId = opts.activePersonaId;
    this.entityStore = this.createEntityStore();
    this.auditSink = new InMemoryAuditSink();
    this.runtime = this.createInnerRuntime();
  }

  async call(req: SdkRequest): Promise<SdkResponse> {
    const failure = this.failureFor(req);
    if (failure) {
      return { ok: false, error: failure };
    }
    return this.runtime.call(req);
  }

  setPersona(id: string): void {
    if (!this.opts.fixtures.personas.some((persona) => persona.id === id)) {
      throw new Error(`Preview persona "${id}" was not found.`);
    }
    this.activePersonaId = id;
  }

  inspectAudit(): AuditRecord[] {
    return this.auditSink.listSync();
  }

  inspectEvents(): EmittedEvent[] {
    return this.runtime.getEventBus().list?.() ?? [];
  }

  explainPermission(capability: string, target: string): PermissionDecision {
    const persona = this.activePersona();
    return this.runtime
      .getPermissionEngine()
      .explain([persona.role], capability, target);
  }

  forceFailure(kind: "permission" | "effect" | "runtime" | null): void {
    this.forcedFailure = kind;
  }

  reset(): void {
    this.forcedFailure = null;
    this.entityStore = this.createEntityStore();
    this.auditSink = new InMemoryAuditSink();
    this.runtime = this.createInnerRuntime();
  }

  private createInnerRuntime(): DomainRuntime {
    return createRuntime({
      compiled: this.opts.compiled,
      entityStore: this.entityStore,
      auditSink: this.auditSink,
      secretResolver: previewSecretResolver,
      effects: this.opts.fixtures.effectStubs.map(effectImplFromStub),
      clock: this.opts.clock,
      ids: this.opts.ids,
      env: this.opts.env ?? "preview",
      identityResolver: {
        resolve: async () => {
          const persona = this.activePersona();
          return {
            actorId: persona.id,
            tenantId: persona.tenantId,
            roles: [persona.role],
          };
        },
      },
    });
  }

  private createEntityStore(): InMemoryEntityStore {
    return new InMemoryEntityStore(this.opts.compiled, this.opts.fixtures.entities);
  }

  private activePersona(): Persona {
    const persona = this.opts.fixtures.personas.find(
      (candidate) => candidate.id === this.activePersonaId,
    );
    if (!persona) {
      throw new Error(`Preview persona "${this.activePersonaId}" was not found.`);
    }
    return persona;
  }

  private failureFor(req: SdkRequest): SdkError | undefined {
    if (this.forcedFailure === "runtime") {
      return { kind: "runtime", message: "Forced preview runtime failure." };
    }
    if (
      this.forcedFailure === "permission" &&
      (req.capability === "process.run" || req.capability === "permissions.can")
    ) {
      return {
        kind: "permission_denied",
        message: "Forced preview permission denial.",
      };
    }
    if (this.forcedFailure === "effect" && this.requestTouchesEffect(req)) {
      return {
        kind: "effect_denied",
        message: "Forced preview effect denial.",
      };
    }
    return undefined;
  }

  private requestTouchesEffect(req: SdkRequest): boolean {
    if (req.capability === "effect.invoke") {
      return true;
    }
    if (req.capability !== "process.run" || !req.target) {
      return false;
    }
    return (
      this.opts.compiled.normalizedProcesses.find(
        (process) => process.id === req.target,
      )?.effects.length ?? 0
    ) > 0;
  }
}

class InMemoryEntityStore implements EntityStore {
  private readonly records = new Map<string, Record<string, unknown>[]>();

  constructor(
    compiled: CompiledManifest,
    fixtures: Record<string, readonly Record<string, unknown>[]>,
  ) {
    for (const [entityName, rows] of Object.entries(fixtures)) {
      this.records.set(entityName, rows.map(cloneRecord));
    }
    for (const entity of compiled.normalizedEntities) {
      const byName = this.records.get(entity.name);
      const byKey = this.records.get(entity.key);
      if (!byName && byKey) {
        this.records.set(entity.name, byKey.map(cloneRecord));
      }
      if (!byKey && byName) {
        this.records.set(entity.key, byName.map(cloneRecord));
      }
    }
  }

  async query(
    entity: string,
    filter: Record<string, unknown>,
    opts: EntityQueryOptions,
  ): Promise<Record<string, unknown>[]> {
    let rows = (this.records.get(entity) ?? []).filter((record) =>
      recordMatches(record, filter),
    );
    if (opts.sortBy) {
      rows = [...rows].sort((left, right) =>
        compareValues(left[opts.sortBy ?? ""], right[opts.sortBy ?? ""]),
      );
      if (opts.sortDirection === "desc") {
        rows.reverse();
      }
    }
    const start = opts.offset ?? 0;
    const end = opts.limit !== undefined ? start + opts.limit : undefined;
    return rows.slice(start, end).map(cloneRecord);
  }

  async get(
    entity: string,
    id: string,
    opts?: { tenantId?: string },
  ): Promise<Record<string, unknown> | null> {
    const record =
      (this.records.get(entity) ?? []).find(
        (candidate) =>
          candidate.id === id &&
          (opts?.tenantId === undefined || candidate.tenantId === opts.tenantId),
      ) ?? null;
    return record ? cloneRecord(record) : null;
  }

  async put(entity: string, record: Record<string, unknown>): Promise<void> {
    const rows = this.records.get(entity) ?? [];
    const index = rows.findIndex((candidate) => candidate.id === record.id);
    if (index >= 0) {
      rows[index] = cloneRecord(record);
    } else {
      rows.push(cloneRecord(record));
    }
    this.records.set(entity, rows);
  }
}

class InMemoryAuditSink implements AuditSink {
  private readonly records: AuditRecord[] = [];

  async append(record: AuditRecord): Promise<void> {
    this.records.push(cloneJson(record));
  }

  async list(): Promise<AuditRecord[]> {
    return this.listSync();
  }

  listSync(): AuditRecord[] {
    return this.records.map(cloneJson);
  }
}

const previewSecretResolver: SecretResolver = {
  async get(ref) {
    return `preview-secret:${ref}`;
  },
};

function effectImplFromStub(
  stub: EffectStub<unknown, unknown>,
): EffectImpl<unknown, unknown> {
  return {
    id: stub.id,
    invoke(input) {
      return stub.stub(input);
    },
  };
}

function recordMatches(
  record: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    if (expected === undefined) {
      continue;
    }
    const actual = record[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) {
        return false;
      }
      continue;
    }
    if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function cloneRecord<T extends Record<string, unknown>>(record: T): T {
  return JSON.parse(JSON.stringify(record)) as T;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
