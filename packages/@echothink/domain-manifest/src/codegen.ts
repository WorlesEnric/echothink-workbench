import { canonicalJSONStringify } from "@echothink/shared-types";
import { normalizeFields } from "./normalizers.js";
import type { AppDomainManifest } from "./schema.js";
import type {
  CompiledManifest,
  GeneratedFile,
  NormalizedEntity,
  NormalizedField,
  NormalizedProcess,
} from "./types.js";

export function generateKernel(compiled: CompiledManifest): GeneratedFile[] {
  return [
    {
      path: "domain.manifest.lock.json",
      contents: prettyCanonical({ lockfileVersion: 1, ...compiled }),
    },
    {
      path: "capability-map.json",
      contents: `${JSON.stringify(compiled.capabilityMap, null, 2)}\n`,
    },
    {
      path: "kernel/generated-types.ts",
      contents: generateTypes(compiled),
    },
    {
      path: "kernel/permission-matrix.generated.ts",
      contents: generatePermissionMatrix(compiled),
    },
    {
      path: "kernel/process-contracts.generated.ts",
      contents: generateProcessContracts(compiled),
    },
    {
      path: "kernel/entity-contracts.generated.ts",
      contents: generateEntityContracts(compiled),
    },
  ];
}

function generateTypes(compiled: CompiledManifest): string {
  const manifest = compiled.manifest;
  const interfaceName = `${toPascalCase(manifest.metadata.id)}Domain`;
  const lines: string[] = [];

  lines.push(`export interface ${interfaceName} {`);
  lines.push(`  id: ${literal(manifest.metadata.id)};`);
  lines.push("  entities: {");
  for (const entity of compiled.normalizedEntities) {
    lines.push(`    ${propertyKey(entity.name)}: ${renderFieldObject(entity.fields, 2)};`);
  }
  lines.push("  };");
  lines.push("  queries: {");
  for (const [queryId, query] of Object.entries(manifest.queries)) {
    lines.push(`    ${propertyKey(queryId)}: {`);
    lines.push(`      args: ${renderQueryArgs(query.filter, 3)};`);
    lines.push(
      `      row: ${interfaceName}["entities"][${literal(query.entity)}];`,
    );
    lines.push("    };");
  }
  lines.push("  };");
  lines.push("  processes: {");
  for (const process of compiled.normalizedProcesses) {
    lines.push(`    ${propertyKey(process.id)}: {`);
    lines.push(`      input: ${renderFieldObject(process.input, 3)};`);
    lines.push(`      output: ${renderFieldObject(process.output, 3)};`);
    lines.push("    };");
  }
  lines.push("  };");
  lines.push("  events: {");
  for (const [eventId, event] of Object.entries(manifest.events)) {
    lines.push(
      `    ${propertyKey(eventId)}: ${renderFieldObject(normalizeFields(event.payload), 2)};`,
    );
  }
  lines.push("  };");
  lines.push("  effects: {");
  for (const [effectId, effect] of Object.entries(manifest.effects)) {
    lines.push(`    ${propertyKey(effectId)}: {`);
    lines.push(
      `      input: ${renderFieldObject(normalizeFields(effect.input ?? {}), 3)};`,
    );
    lines.push(
      `      output: ${renderFieldObject(normalizeFields(effect.output ?? {}), 3)};`,
    );
    lines.push("    };");
  }
  lines.push("  };");
  lines.push(`  permissions: ${renderStringUnion(manifest.permissions.map((p) => p.id))};`);
  lines.push("}");

  return `${lines.join("\n")}\n`;
}

function generatePermissionMatrix(compiled: CompiledManifest): string {
  const roles = compiled.manifest.identity.roles.map((role) => role.id);
  const permissions = compiled.manifest.permissions.map((permission) => permission.id);
  const lines: string[] = [];

  lines.push('export type PermissionCapability = "process.run" | "entity.query" | "entity.get" | "event.subscribe" | "effect.invoke";');
  lines.push("");
  lines.push(`export type Role = ${renderStringUnion(roles)};`);
  lines.push(`export type PermissionId = ${renderStringUnion(permissions)};`);
  lines.push("");
  lines.push("export interface PermissionMatrixRow {");
  lines.push("  role: Role;");
  lines.push("  capability: PermissionCapability;");
  lines.push("  target: string;");
  lines.push("  permission?: PermissionId;");
  lines.push("  allowed: boolean;");
  lines.push("}");
  lines.push("");
  lines.push(
    `export const permissionMatrix: PermissionMatrixRow[] = ${JSON.stringify(compiled.permissionMatrix, null, 2)};`,
  );
  lines.push("");
  lines.push("export function rolesForPermission(p: PermissionId): Role[] {");
  lines.push("  const roles = new Set<Role>();");
  lines.push("  for (const row of permissionMatrix) {");
  lines.push("    if (row.permission === p && row.allowed) {");
  lines.push("      roles.add(row.role);");
  lines.push("    }");
  lines.push("  }");
  lines.push("  return [...roles];");
  lines.push("}");

  return `${lines.join("\n")}\n`;
}

function generateProcessContracts(compiled: CompiledManifest): string {
  const lines: string[] = [];

  for (const process of compiled.normalizedProcesses) {
    const baseName = toPascalCase(process.id);
    lines.push(renderNamedObjectType(`${baseName}Input`, process.input));
    lines.push("");
    lines.push(renderNamedObjectType(`${baseName}Output`, process.output));
    lines.push("");
  }

  lines.push(
    `export const processContracts = ${JSON.stringify(processContractObject(compiled.normalizedProcesses), null, 2)} as const;`,
  );

  return `${lines.join("\n")}\n`;
}

function generateEntityContracts(compiled: CompiledManifest): string {
  const lines: string[] = [];

  for (const entity of compiled.normalizedEntities) {
    lines.push(renderNamedObjectType(entity.name, entity.fields));
    lines.push("");
  }

  lines.push(
    `export const entityContracts = ${JSON.stringify(entityContractObject(compiled.normalizedEntities), null, 2)} as const;`,
  );

  return `${lines.join("\n")}\n`;
}

function renderNamedObjectType(name: string, fields: NormalizedField[]): string {
  if (fields.length === 0) {
    return `export type ${toTypeName(name)} = Record<string, never>;`;
  }

  const lines = [`export interface ${toTypeName(name)} {`];
  for (const field of fields) {
    lines.push(`  ${propertyKey(field.name)}: ${tsTypeForField(field)};`);
  }
  lines.push("}");
  return lines.join("\n");
}

function renderFieldObject(fields: NormalizedField[], indentLevel: number): string {
  if (fields.length === 0) {
    return "Record<string, never>";
  }

  const indent = spaces(indentLevel);
  const childIndent = spaces(indentLevel + 1);
  const lines = ["{"];
  for (const field of fields) {
    lines.push(`${childIndent}${propertyKey(field.name)}: ${tsTypeForField(field)};`);
  }
  lines.push(`${indent}}`);
  return lines.join("\n");
}

function renderQueryArgs(
  filter: AppDomainManifest["queries"][string]["filter"],
  indentLevel: number,
): string {
  const entries = Object.keys(filter ?? {});
  if (entries.length === 0) {
    return "Record<string, unknown>";
  }

  const indent = spaces(indentLevel);
  const childIndent = spaces(indentLevel + 1);
  const lines = ["{"];
  for (const key of entries) {
    lines.push(`${childIndent}${propertyKey(key)}?: unknown;`);
  }
  lines.push(`${indent}}`);
  return lines.join("\n");
}

function tsTypeForField(field: NormalizedField): string {
  let base: string;
  if (field.arrayOf) {
    base = `${tsTypeForKind(field.arrayOf)}[]`;
  } else if (field.kind === "enum") {
    base = renderStringUnion(field.enumValues ?? []);
  } else if (field.kind === "ref") {
    base = "string";
  } else {
    base = tsTypeForKind(field.kind);
  }
  return field.optional ? `${base} | null` : base;
}

function tsTypeForKind(kind: NormalizedField["kind"]): string {
  switch (kind) {
    case "string":
    case "date":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "json":
      return "unknown";
    case "enum":
      return "string";
    case "ref":
      return "string";
  }
}

function processContractObject(
  processes: NormalizedProcess[],
): Record<string, unknown> {
  return Object.fromEntries(
    processes.map((process) => [
      process.id,
      {
        input: process.input,
        output: process.output,
        ...(process.requires ? { requires: process.requires } : {}),
        preconditions: process.preconditions,
        reads: process.reads,
        writes: process.writes,
        transitions: process.transitions,
        emits: process.emits,
        effects: process.effects,
        ...(process.audit ? { audit: process.audit } : {}),
        ...(process.idempotency ? { idempotency: process.idempotency } : {}),
        ...(process.compensation ? { compensation: process.compensation } : {}),
        ...(process.actorType ? { actorType: process.actorType } : {}),
        ...(process.policyClass ? { policyClass: process.policyClass } : {}),
      },
    ]),
  );
}

function entityContractObject(
  entities: NormalizedEntity[],
): Record<string, unknown> {
  return Object.fromEntries(
    entities.map((entity) => [
      entity.name,
      {
        key: entity.key,
        schema: entity.fields,
        tenantScope: entity.tenantScope,
        ...(entity.stateField ? { stateField: entity.stateField } : {}),
        ...(entity.stateMachine ? { stateMachine: entity.stateMachine } : {}),
        ...(entity.relationships ? { relationships: entity.relationships } : {}),
        ...(entity.sensitivity ? { sensitivity: entity.sensitivity } : {}),
        ...(entity.retention ? { retention: entity.retention } : {}),
        ...(entity.audit ? { audit: entity.audit } : {}),
      },
    ]),
  );
}

function prettyCanonical(value: unknown): string {
  return `${JSON.stringify(JSON.parse(canonicalJSONStringify(value)), null, 2)}\n`;
}

function renderStringUnion(values: string[]): string {
  if (values.length === 0) {
    return "never";
  }
  return values.map((value) => literal(value)).join(" | ");
}

function toPascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => {
      const lower = part.toLowerCase();
      const known = knownAcronym(lower);
      if (known) {
        return known;
      }
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
    })
    .join("");
}

function toTypeName(value: string): string {
  const pascal = toPascalCase(value);
  return /^[A-Za-z_]/.test(pascal) ? pascal : `_${pascal}`;
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

function propertyKey(value: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : literal(value);
}

function literal(value: string): string {
  return JSON.stringify(value);
}

function spaces(level: number): string {
  return "  ".repeat(level);
}
