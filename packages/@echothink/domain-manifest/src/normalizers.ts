import type { Entity, FieldSpec, IoFieldSpec, UnitProcess } from "./schema.js";
import type {
  NormalizedEntity,
  NormalizedField,
  NormalizedProcess,
  NormalizedTransition,
} from "./types.js";
import { parseFieldSpecString } from "./field-spec.js";

type TransitionValue = NonNullable<UnitProcess["transitions"]>[string];

export function normalizeField(
  name: string,
  spec: FieldSpec | IoFieldSpec,
): NormalizedField {
  if (typeof spec === "string") {
    const parsed = parseFieldSpecString(spec, { allowInlineEnum: true });
    if (!parsed) {
      throw new Error(`Unsupported field shorthand for ${name}: ${spec}`);
    }
    if (parsed.kind === "enum") {
      return {
        name,
        kind: "enum",
        optional: parsed.optional,
        enumValues: parsed.enumValues ?? [],
      };
    }
    if (parsed.kind === "array") {
      const arrayOf = parsed.arrayOf ?? "string";
      return {
        name,
        kind: arrayOf,
        optional: parsed.optional,
        arrayOf,
      };
    }
    const type = parsed.type ?? "string";
    return { name, kind: type, optional: parsed.optional };
  }

  if ("enum" in spec) {
    return {
      name,
      kind: "enum",
      optional: spec.optional ?? false,
      enumValues: [...spec.enum],
    };
  }

  if ("ref" in spec) {
    return {
      name,
      kind: "ref",
      optional: spec.optional ?? false,
      refEntity: spec.ref,
    };
  }

  const parsed = parseFieldSpecString(spec.type, { allowInlineEnum: false });
  if (!parsed) {
    throw new Error(`Unsupported field type for ${name}: ${spec.type}`);
  }
  const optional = (spec.optional ?? false) || parsed.optional;
  if (parsed.kind === "array") {
    const arrayOf = parsed.arrayOf ?? "string";
    return {
      name,
      kind: arrayOf,
      optional,
      arrayOf,
    };
  }
  const type = parsed.type ?? "string";
  return { name, kind: type, optional };
}

export function normalizeFields(
  schema: Record<string, FieldSpec | IoFieldSpec>,
): NormalizedField[] {
  return Object.entries(schema).map(([name, spec]) => normalizeField(name, spec));
}

export function normalizeEntity(
  name: string,
  entity: Entity,
): NormalizedEntity {
  return {
    name,
    key: entity.key,
    fields: normalizeFields(entity.schema),
    tenantScope: entity.tenantScope,
    ...(entity.stateField ? { stateField: entity.stateField } : {}),
    ...(entity.stateMachine ? { stateMachine: entity.stateMachine } : {}),
    ...(entity.relationships ? { relationships: entity.relationships } : {}),
    ...(entity.sensitivity ? { sensitivity: [...entity.sensitivity] } : {}),
    ...(entity.retention ? { retention: entity.retention } : {}),
    ...(entity.audit ? { audit: entity.audit } : {}),
  };
}

export function normalizeEntities(
  entities: Record<string, Entity>,
): NormalizedEntity[] {
  return Object.entries(entities).map(([name, entity]) =>
    normalizeEntity(name, entity),
  );
}

export function normalizeTransition(
  target: string,
  value: TransitionValue,
): NormalizedTransition {
  const { entity, field } = splitTransitionTarget(target);
  if (isExactTransitionValue(value)) {
    return {
      kind: "exact",
      target,
      entity,
      field,
      ...(value.from !== undefined ? { from: value.from } : {}),
      ...(value.to !== undefined ? { to: value.to } : {}),
    };
  }

  return {
    kind: "input-map",
    target,
    entity,
    field,
    mapping: { ...value },
  };
}

export function normalizeProcess(
  id: string,
  process: UnitProcess,
): NormalizedProcess {
  const transitions = Object.entries(process.transitions ?? {}).map(
    ([target, transition]) => normalizeTransition(target, transition),
  );

  return {
    id,
    input: normalizeFields(process.input),
    output: normalizeFields(process.output ?? {}),
    ...(process.requires ? { requires: process.requires } : {}),
    preconditions: [...(process.preconditions ?? [])],
    reads: [...(process.reads ?? [])],
    writes: [...(process.writes ?? [])],
    transitions,
    emits: [...(process.emits ?? [])],
    effects: [...(process.effects ?? [])],
    ...(process.audit ? { audit: process.audit } : {}),
    ...(process.idempotency ? { idempotency: process.idempotency } : {}),
    ...(process.compensation ? { compensation: process.compensation } : {}),
    ...(process.actorType ? { actorType: process.actorType } : {}),
    ...(process.policyClass ? { policyClass: process.policyClass } : {}),
  };
}

export function normalizeProcesses(
  processes: Record<string, UnitProcess>,
): NormalizedProcess[] {
  return Object.entries(processes).map(([id, process]) =>
    normalizeProcess(id, process),
  );
}

function splitTransitionTarget(target: string): { entity: string; field: string } {
  const separator = target.indexOf(".");
  if (separator === -1) {
    return { entity: target, field: "" };
  }
  return {
    entity: target.slice(0, separator),
    field: target.slice(separator + 1),
  };
}

function isExactTransitionValue(
  value: TransitionValue,
): value is { from?: string; to?: string } {
  return Object.prototype.hasOwnProperty.call(value, "from")
    || Object.prototype.hasOwnProperty.call(value, "to");
}
