import type {
  CompiledManifest,
  NormalizedEntity,
  NormalizedField,
  NormalizedProcess,
  SurfaceRegistration,
} from "@echothink/domain-manifest";

export function titleCase(value: string): string {
  return value
    .split(/[-_.\s]+/u)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function pascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      const known = knownAcronym(lower);
      return known ?? `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
    })
    .join("");
}

export function camelCase(value: string): string {
  const pascal = pascalCase(value);
  return pascal.length === 0
    ? "value"
    : `${pascal.slice(0, 1).toLowerCase()}${pascal.slice(1)}`;
}

export function safeIdentifier(value: string): string {
  const candidate = camelCase(value);
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(candidate)
    ? candidate
    : `value${pascalCase(value)}`;
}

export function literal(value: string): string {
  return JSON.stringify(value);
}

export function propertyKey(value: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value) ? value : literal(value);
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function findEntityByNameOrKey(
  compiled: CompiledManifest,
  nameOrKey: string,
): NormalizedEntity | undefined {
  return compiled.normalizedEntities.find(
    (entity) => entity.name === nameOrKey || entity.key === nameOrKey,
  );
}

export function resolveSurfaceQuery(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): { id: string; definition: CompiledManifest["manifest"]["queries"][string] } | undefined {
  if (surface.query) {
    const definition = compiled.manifest.queries[surface.query];
    if (definition) {
      return { id: surface.query, definition };
    }
  }

  const requiredPermissions = new Set(surface.requiredPermissions);
  const permissionMatch = Object.entries(compiled.manifest.queries).find(
    ([, query]) =>
      query.permissions?.read !== undefined &&
      requiredPermissions.has(query.permissions.read),
  );
  if (permissionMatch) {
    return { id: permissionMatch[0], definition: permissionMatch[1] };
  }

  const first = Object.entries(compiled.manifest.queries)[0];
  return first ? { id: first[0], definition: first[1] } : undefined;
}

export function resolveSurfaceEntity(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): NormalizedEntity | undefined {
  const query = resolveSurfaceQuery(compiled, surface);
  if (query) {
    const entity = findEntityByNameOrKey(compiled, query.definition.entity);
    if (entity) {
      return entity;
    }
  }

  const requiredPermissions = new Set(surface.requiredPermissions);
  const process = compiled.normalizedProcesses.find(
    (candidate) =>
      candidate.requires?.permission !== undefined &&
      requiredPermissions.has(candidate.requires.permission),
  );
  if (process) {
    return entityForProcess(compiled, process);
  }

  return compiled.normalizedEntities.length === 1
    ? compiled.normalizedEntities[0]
    : undefined;
}

export function processesForSurface(
  compiled: CompiledManifest,
  surface: SurfaceRegistration,
): NormalizedProcess[] {
  const entity = resolveSurfaceEntity(compiled, surface);
  const requiredPermissions = new Set(surface.requiredPermissions);
  return compiled.normalizedProcesses
    .filter((process) => {
      if (
        process.requires?.permission !== undefined &&
        requiredPermissions.has(process.requires.permission)
      ) {
        return true;
      }
      return entity ? processTouchesEntity(process, entity) : false;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function processTouchesEntity(
  process: NormalizedProcess,
  entity: NormalizedEntity,
): boolean {
  const identifiers = new Set([entity.name, entity.key]);
  return (
    process.reads.some((read) => identifiers.has(read)) ||
    process.writes.some((write) => identifiers.has(write)) ||
    process.transitions.some((transition) => identifiers.has(transition.entity)) ||
    process.id.startsWith(`${entity.key}.`)
  );
}

export function entityForProcess(
  compiled: CompiledManifest,
  process: NormalizedProcess,
): NormalizedEntity | undefined {
  const candidates = [
    ...process.writes,
    ...process.reads,
    ...process.transitions.map((transition) => transition.entity),
  ];
  for (const candidate of candidates) {
    const entity = findEntityByNameOrKey(compiled, candidate);
    if (entity) {
      return entity;
    }
  }
  const prefix = process.id.split(".", 1)[0];
  return prefix ? findEntityByNameOrKey(compiled, prefix) : undefined;
}

export function labelForField(fieldName: string): string {
  const spaced = fieldName
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[-_]+/gu, " ");
  return `${spaced.slice(0, 1).toUpperCase()}${spaced.slice(1)}`;
}

export function typeForField(field: NormalizedField): string {
  const base = baseTypeForField(field);
  return field.optional ? `${base} | null` : base;
}

export function arrayLiteral(values: readonly string[]): string {
  return `[${values.map(literal).join(", ")}]`;
}

function baseTypeForField(field: NormalizedField): string {
  if (field.arrayOf) {
    return `${scalarType(field.arrayOf)}[]`;
  }
  if (field.kind === "enum") {
    return field.enumValues?.length
      ? field.enumValues.map(literal).join(" | ")
      : "string";
  }
  if (field.kind === "ref") {
    return "string";
  }
  return scalarType(field.kind);
}

function scalarType(kind: NormalizedField["kind"]): string {
  switch (kind) {
    case "string":
    case "date":
    case "enum":
    case "ref":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "json":
      return "unknown";
  }
}

function knownAcronym(value: string): string | undefined {
  switch (value) {
    case "api":
      return "API";
    case "sdk":
      return "SDK";
    case "ui":
      return "UI";
    case "github":
      return "GitHub";
    default:
      return undefined;
  }
}
