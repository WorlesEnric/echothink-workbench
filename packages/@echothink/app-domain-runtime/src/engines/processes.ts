import type {
  CompiledManifest,
  NormalizedEntity,
  NormalizedField,
  NormalizedProcess,
  NormalizedTransition,
} from "@echothink/domain-manifest";

import type {
  Clock,
  EmittedEvent,
  EntityStore,
  IdGenerator,
  RuntimeContext,
} from "../adapters.js";
import { RuntimeSdkError, sdkError } from "../errors.js";
import type { AuditEngine } from "./audit.js";
import type { EffectInvoker } from "./effects.js";
import type { EntityGateway } from "./entities.js";
import type { DomainEventBus } from "./events.js";
import type { PermissionEngine } from "./permissions.js";
import type { StateMachineEvaluator } from "./state-machine.js";

export interface ProcessTransitionResult {
  entity: string;
  id: string;
  field: string;
  from: unknown;
  to: unknown;
}

export interface ProcessRunResult {
  output: Record<string, unknown>;
  transitions: ProcessTransitionResult[];
  emitted: EmittedEvent[];
  effects: Record<string, unknown>;
  runId: string;
}

export interface UnitProcessEngine {
  run(
    ctx: RuntimeContext,
    processId: string,
    input: unknown,
  ): Promise<ProcessRunResult>;
}

interface LoadedRecord {
  entity: NormalizedEntity;
  record: Record<string, unknown>;
}

export class DefaultUnitProcessEngine implements UnitProcessEngine {
  constructor(
    private readonly compiled: CompiledManifest,
    private readonly store: EntityStore,
    private readonly entityGateway: EntityGateway,
    private readonly permissionEngine: PermissionEngine,
    private readonly stateMachine: StateMachineEvaluator,
    private readonly effectInvoker: EffectInvoker,
    private readonly eventBus: DomainEventBus,
    private readonly audit: AuditEngine,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async run(
    ctx: RuntimeContext,
    processId: string,
    input: unknown,
  ): Promise<ProcessRunResult> {
    const process = this.processFor(processId);
    const runId = this.ids.next("run");
    const reason = readReason(input);
    const redactPaths = this.redactPathsFor(process);

    try {
      const result = await this.runInternal(ctx, process, runId, input, reason);
      await this.auditProcess(ctx, process, runId, "ok", reason, input, redactPaths);
      return result;
    } catch (error) {
      await this.auditProcess(
        ctx,
        process,
        runId,
        error instanceof RuntimeSdkError &&
          error.sdkError.kind === "permission_denied"
          ? "denied"
          : "error",
        error instanceof Error ? error.message : undefined,
        input,
        redactPaths,
      );
      throw error;
    }
  }

  private async runInternal(
    ctx: RuntimeContext,
    process: NormalizedProcess,
    runId: string,
    input: unknown,
    reason: string | undefined,
  ): Promise<ProcessRunResult> {
    if (process.requires?.permission) {
      const decision = this.permissionEngine.can(
        ctx.roles,
        "permission",
        process.requires.permission,
      );
      if (!decision.allowed) {
        throw sdkError(
          "permission_denied",
          `Process "${process.id}" requires permission ${process.requires.permission}.`,
          {
            processId: process.id,
            permission: process.requires.permission,
            reason: decision.reason,
          },
        );
      }
    }

    const validatedInput = validateInput(process.input, input);
    if (process.audit?.reasonRequired && !reason) {
      throw sdkError("validation", `Process "${process.id}" requires a reason.`, {
        processId: process.id,
        field: "reason",
      });
    }

    const loaded = new Map<string, LoadedRecord>();
    await this.evaluatePreconditions(ctx, process, validatedInput, loaded);
    await this.loadDeclaredReads(ctx, process, validatedInput, loaded);
    const { writes, transitions } = await this.prepareWrites(
      ctx,
      process,
      validatedInput,
      loaded,
    );

    const output = this.deriveOutput(process, validatedInput, loaded);
    const effectInputs = new Map<string, unknown>();
    for (const effectId of process.effects) {
      this.effectInvoker.preflight(ctx, effectId, runId);
      effectInputs.set(effectId, this.buildEffectInput(validatedInput, output, loaded));
    }

    const effects: Record<string, unknown> = {};
    for (const [effectId, effectInput] of effectInputs) {
      effects[effectId] = await this.effectInvoker.invoke(ctx, {
        effectId,
        input: effectInput,
        processRunId: runId,
      });
    }

    for (const write of writes) {
      await this.store.put(write.entity.name, write.record);
    }

    const emitted = await this.emitEvents(ctx, process, runId, validatedInput, output);
    return { output, transitions, emitted, effects, runId };
  }

  private async evaluatePreconditions(
    ctx: RuntimeContext,
    process: NormalizedProcess,
    input: Record<string, unknown>,
    loaded: Map<string, LoadedRecord>,
  ): Promise<void> {
    for (const predicate of process.preconditions) {
      const parsed = parsePredicate(predicate);
      if (!parsed) {
        throw sdkError("validation", `Unsupported precondition: ${predicate}`, {
          processId: process.id,
          predicate,
        });
      }

      const record = await this.loadRecord(ctx, parsed.entity, input, loaded);
      const actual = record.record[parsed.field];
      const ok =
        parsed.operator === "in"
          ? parsed.values.some((value) => value === String(actual))
          : String(actual) === parsed.values[0];
      if (!ok) {
        throw sdkError(
          "validation",
          `Precondition failed: ${predicate}`,
          {
            processId: process.id,
            predicate,
            actual,
          },
        );
      }
    }
  }

  private async loadDeclaredReads(
    ctx: RuntimeContext,
    process: NormalizedProcess,
    input: Record<string, unknown>,
    loaded: Map<string, LoadedRecord>,
  ): Promise<void> {
    for (const entityName of process.reads) {
      await this.loadRecord(ctx, entityName, input, loaded);
    }
  }

  private async prepareWrites(
    ctx: RuntimeContext,
    process: NormalizedProcess,
    input: Record<string, unknown>,
    loaded: Map<string, LoadedRecord>,
  ): Promise<{
    writes: Array<{ entity: NormalizedEntity; record: Record<string, unknown> }>;
    transitions: ProcessTransitionResult[];
  }> {
    const writes = new Map<string, { entity: NormalizedEntity; record: Record<string, unknown> }>();
    const transitions: ProcessTransitionResult[] = [];

    for (const transition of process.transitions) {
      const loadedRecord = await this.loadRecord(
        ctx,
        transition.entity,
        input,
        loaded,
      );
      const id = stringId(loadedRecord.record.id);
      const from = loadedRecord.record[transition.field];
      const to = transitionToState(transition, input);
      if (to === undefined) {
        throw sdkError(
          "invalid_transition",
          `Process "${process.id}" does not resolve a target state for ${transition.target}.`,
          { processId: process.id, transition },
        );
      }
      if (transition.kind === "exact" && transition.from !== undefined) {
        if (String(from) !== transition.from) {
          throw sdkError(
            "invalid_transition",
            `Process "${process.id}" cannot transition ${transition.target} from ${String(from)}.`,
            { processId: process.id, transition, from },
          );
        }
      }
      if (
        !this.stateMachine.isLegalTransition(
          loadedRecord.entity,
          transition.field,
          from,
          to,
        )
      ) {
        throw sdkError(
          "invalid_transition",
          `Illegal transition ${loadedRecord.entity.name}.${transition.field}: ${String(from)} -> ${String(to)}.`,
          {
            processId: process.id,
            entity: loadedRecord.entity.name,
            field: transition.field,
            from,
            to,
          },
        );
      }

      const existingWrite = writes.get(loadedRecord.entity.name);
      const record = existingWrite?.record ?? cloneRecord(loadedRecord.record);
      record[transition.field] = to;
      mergeInputFields(record, loadedRecord.entity, input);
      writes.set(loadedRecord.entity.name, {
        entity: loadedRecord.entity,
        record,
      });
      transitions.push({
        entity: loadedRecord.entity.name,
        id,
        field: transition.field,
        from,
        to,
      });
    }

    return { writes: [...writes.values()], transitions };
  }

  private async loadRecord(
    ctx: RuntimeContext,
    entityNameOrKey: string,
    input: Record<string, unknown>,
    loaded: Map<string, LoadedRecord>,
  ): Promise<LoadedRecord> {
    const entity = this.entityFor(entityNameOrKey);
    const cached = loaded.get(entity.name);
    if (cached) {
      return cached;
    }

    const id = findEntityId(entity, input);
    if (!id) {
      throw sdkError(
        "validation",
        `No input id was provided for entity "${entity.name}".`,
        { entity: entity.name },
      );
    }

    const record = await this.entityGateway.get(ctx, entity.name, id);
    if (!record) {
      throw sdkError(
        "validation",
        `Entity "${entity.name}" record "${id}" was not found.`,
        { entity: entity.name, id },
      );
    }

    const loadedRecord = { entity, record };
    loaded.set(entity.name, loadedRecord);
    return loadedRecord;
  }

  private buildEffectInput(
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    loaded: Map<string, LoadedRecord>,
  ): Record<string, unknown> {
    const firstRecord = [...loaded.values()][0]?.record ?? {};
    const effectInput: Record<string, unknown> = {
      ...firstRecord,
      ...output,
      ...input,
    };
    if (
      effectInput.issueNumber === undefined &&
      typeof effectInput.issueId === "string"
    ) {
      const issueNumber = numericSuffix(effectInput.issueId);
      if (issueNumber !== undefined) {
        effectInput.issueNumber = issueNumber;
      }
    }
    return effectInput;
  }

  private deriveOutput(
    process: NormalizedProcess,
    input: Record<string, unknown>,
    loaded: Map<string, LoadedRecord>,
  ): Record<string, unknown> {
    const record = [...loaded.values()][0]?.record ?? {};
    const output: Record<string, unknown> = {};
    for (const field of process.output) {
      if (input[field.name] !== undefined) {
        output[field.name] = input[field.name];
      } else if (record[field.name] !== undefined) {
        output[field.name] = record[field.name];
      }
    }
    return output;
  }

  private async emitEvents(
    ctx: RuntimeContext,
    process: NormalizedProcess,
    runId: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
  ): Promise<EmittedEvent[]> {
    const emitted: EmittedEvent[] = [];
    for (const eventId of process.emits) {
      const eventDef = this.compiled.manifest.events[eventId];
      if (!eventDef) {
        throw sdkError("not_found", `Event "${eventId}" was not found.`, {
          eventId,
        });
      }
      const payload: Record<string, unknown> = {};
      for (const fieldName of Object.keys(eventDef.payload)) {
        if (input[fieldName] !== undefined) {
          payload[fieldName] = input[fieldName];
        } else if (output[fieldName] !== undefined) {
          payload[fieldName] = output[fieldName];
        } else if (fieldName === "actorId") {
          payload[fieldName] = ctx.actorId;
        } else if (fieldName === "processRunId") {
          payload[fieldName] = runId;
        }
      }

      const event: EmittedEvent = {
        id: this.ids.next("event"),
        ts: this.clock.now(),
        type: eventId,
        payload,
        actorId: ctx.actorId,
        tenantId: ctx.tenantId,
      };
      await this.eventBus.emit(event);
      emitted.push(event);
    }
    return emitted;
  }

  private async auditProcess(
    ctx: RuntimeContext,
    process: NormalizedProcess,
    runId: string,
    result: "ok" | "denied" | "error",
    reason: string | undefined,
    input: unknown,
    redactPaths: readonly string[],
  ): Promise<void> {
    await this.audit.append(
      {
        id: this.ids.next("audit"),
        ts: this.clock.now(),
        actorId: ctx.actorId,
        tenantId: ctx.tenantId,
        domainId: ctx.domainId,
        ...(ctx.surfaceId ? { surfaceId: ctx.surfaceId } : {}),
        capability: "process.run",
        target: process.id,
        result,
        ...(reason ? { reason } : {}),
        redactedInput: this.audit.redact({ runId, input }, redactPaths),
      },
      process.audit?.level ?? "always",
    );
  }

  private redactPathsFor(process: NormalizedProcess): string[] {
    return process.effects.flatMap((effectId) => {
      const effect = this.compiled.manifest.effects[effectId];
      return effect?.audit?.redact ?? [];
    });
  }

  private processFor(processId: string): NormalizedProcess {
    const process = this.compiled.normalizedProcesses.find(
      (candidate) => candidate.id === processId,
    );
    if (!process) {
      throw sdkError("not_found", `Process "${processId}" was not found.`, {
        processId,
      });
    }
    return process;
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

function validateInput(
  fields: readonly NormalizedField[],
  input: unknown,
): Record<string, unknown> {
  if (!isRecord(input)) {
    throw sdkError("validation", "Process input must be an object.");
  }

  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = input[field.name];
    if (value === undefined || value === null) {
      if (field.optional) {
        continue;
      }
      throw sdkError("validation", `Missing required input "${field.name}".`, {
        field: field.name,
      });
    }
    result[field.name] = coerceField(field, value);
  }
  return result;
}

function coerceField(field: NormalizedField, value: unknown): unknown {
  const arrayOf = field.arrayOf;
  if (arrayOf !== undefined) {
    if (!Array.isArray(value)) {
      throw sdkError("validation", `Input "${field.name}" must be an array.`, {
        field: field.name,
      });
    }
    return value.map((item) => coerceScalar(field.name, arrayOf, item));
  }

  if (field.kind === "enum") {
    if (typeof value !== "string" || !field.enumValues?.includes(value)) {
      throw sdkError(
        "validation",
        `Input "${field.name}" must be one of ${field.enumValues?.join(", ")}.`,
        { field: field.name, value },
      );
    }
    return value;
  }

  return coerceScalar(field.name, field.kind, value);
}

function coerceScalar(
  fieldName: string,
  kind: NormalizedField["kind"],
  value: unknown,
): unknown {
  if (kind === "json") {
    return value;
  }
  if (kind === "string" || kind === "ref") {
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }
  if (kind === "number") {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  if (kind === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }
  if (kind === "date") {
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
      return value;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }
  }

  throw sdkError("validation", `Input "${fieldName}" has invalid type.`, {
    field: fieldName,
    kind,
  });
}

function parsePredicate(
  predicate: string,
):
  | { entity: string; field: string; operator: "in" | "=="; values: string[] }
  | undefined {
  const inMatch = /^([A-Za-z][A-Za-z0-9_-]*)\.([A-Za-z][A-Za-z0-9_]*)\s+in\s+\[([^\]]*)\]$/.exec(
    predicate,
  );
  if (inMatch) {
    return {
      entity: inMatch[1] ?? "",
      field: inMatch[2] ?? "",
      operator: "in",
      values: (inMatch[3] ?? "")
        .split(",")
        .map((value) => stripQuotes(value.trim()))
        .filter((value) => value.length > 0),
    };
  }

  const equalsMatch = /^([A-Za-z][A-Za-z0-9_-]*)\.([A-Za-z][A-Za-z0-9_]*)\s*==\s*(.+)$/.exec(
    predicate,
  );
  if (equalsMatch) {
    return {
      entity: equalsMatch[1] ?? "",
      field: equalsMatch[2] ?? "",
      operator: "==",
      values: [stripQuotes((equalsMatch[3] ?? "").trim())],
    };
  }

  return undefined;
}

function transitionToState(
  transition: NormalizedTransition,
  input: Record<string, unknown>,
): unknown {
  if (transition.kind === "exact") {
    return transition.to;
  }

  const candidate =
    input[transition.field] ??
    input.status ??
    input.decision ??
    input.outcome ??
    input.action;
  if (candidate === undefined) {
    return undefined;
  }
  return transition.mapping[String(candidate)];
}

function mergeInputFields(
  record: Record<string, unknown>,
  entity: NormalizedEntity,
  input: Record<string, unknown>,
): void {
  const entityFields = new Set(entity.fields.map((field) => field.name));
  for (const [key, value] of Object.entries(input)) {
    if (key === "id" || key.endsWith("Id") || !entityFields.has(key)) {
      continue;
    }
    record[key] = value;
  }
}

function findEntityId(
  entity: NormalizedEntity,
  input: Record<string, unknown>,
): string | undefined {
  const candidates = [
    `${lowerFirst(entity.name)}Id`,
    `${entity.key}Id`,
    `${entity.name}Id`,
    "id",
  ];
  for (const key of candidates) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function readReason(input: unknown): string | undefined {
  if (!isRecord(input) || typeof input.reason !== "string") {
    return undefined;
  }
  const reason = input.reason.trim();
  return reason.length > 0 ? reason : undefined;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function lowerFirst(value: string): string {
  return value.length === 0
    ? value
    : `${value.slice(0, 1).toLowerCase()}${value.slice(1)}`;
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}

function stringId(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw sdkError("validation", "Entity record is missing string id.");
}

function numericSuffix(value: string): number | undefined {
  const match = /(\d+)$/.exec(value);
  if (!match) {
    return undefined;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
