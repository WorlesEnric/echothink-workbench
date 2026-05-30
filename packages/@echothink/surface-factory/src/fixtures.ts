import {
  normalizeFields,
  type CompiledManifest,
  type NormalizedEntity,
  type NormalizedField,
} from "@echothink/domain-manifest";

import type { GeneratedFile } from "./types.js";
import { stableJson } from "./utils.js";

export function generateFixtures(compiled: CompiledManifest): GeneratedFile[] {
  return [
    {
      path: "fixtures/personas.yaml",
      contents: renderPersonas(compiled),
    },
    {
      path: "fixtures/sample-entities.json",
      contents: stableJson(generateSampleEntities(compiled)),
    },
    {
      path: "fixtures/effect-stubs.yaml",
      contents: renderEffectStubs(compiled),
    },
  ];
}

function renderPersonas(compiled: CompiledManifest): string {
  const personas = compiled.manifest.identity.personas ?? [];
  const lines = ["personas:"];
  for (const persona of personas) {
    lines.push(`  - id: ${yamlScalar(persona.id)}`);
    lines.push(`    role: ${yamlScalar(persona.role)}`);
    if (persona.tenantId) {
      lines.push(`    tenantId: ${yamlScalar(persona.tenantId)}`);
    }
    if (persona.label) {
      lines.push(`    label: ${yamlScalar(persona.label)}`);
    }
    if (persona.invalid !== undefined) {
      lines.push(`    invalid: ${persona.invalid}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function generateSampleEntities(
  compiled: CompiledManifest,
): Record<string, Record<string, unknown>[]> {
  return Object.fromEntries(
    compiled.normalizedEntities.map((entity) => [
      entity.name,
      [0, 1, 2].map((index) => sampleRecord(entity, index)),
    ]),
  );
}

function sampleRecord(
  entity: NormalizedEntity,
  index: number,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  if (entity.tenantScope === "organization") {
    record.tenantId = "org_456";
  }
  for (const field of entity.fields) {
    record[field.name] = sampleValue(entity, field, index);
  }
  return record;
}

function sampleValue(
  entity: NormalizedEntity,
  field: NormalizedField,
  index: number,
): unknown {
  if (field.name === "id") {
    return `${entity.key}-${index + 1}`;
  }
  if (field.name === entity.stateField) {
    return stateForRecord(entity, index);
  }
  if (field.name === "repo") {
    return "dyad-sh/dyad";
  }
  if (field.name === "title") {
    return `${entity.name} ${index + 1}`;
  }
  if (field.name === "labels") {
    return index === 0 ? [] : ["bug", "support"].slice(0, index);
  }
  if (field.name === "assignee") {
    return index > 1 ? "triage-lead" : null;
  }
  if (field.name === "priority") {
    return ["low", "medium", "high"][index] ?? "low";
  }
  if (field.name === "createdAt" || field.kind === "date") {
    return `2026-05-0${index + 1}T00:00:00.000Z`;
  }
  if (field.arrayOf) {
    return [];
  }
  if (field.kind === "enum") {
    return field.enumValues?.[index % field.enumValues.length] ?? "unknown";
  }
  if (field.kind === "number") {
    return index + 1;
  }
  if (field.kind === "boolean") {
    return index % 2 === 0;
  }
  if (field.kind === "json") {
    return { fixture: true, index };
  }
  if (field.optional) {
    return null;
  }
  return `${field.name}-${index + 1}`;
}

function stateForRecord(entity: NormalizedEntity, index: number): string {
  const machine = entity.stateMachine;
  if (!machine) {
    return "active";
  }
  if (index === 0) {
    return machine.initial;
  }
  const transition = machine.transitions[index - 1];
  return transition?.to ?? machine.initial;
}

function renderEffectStubs(compiled: CompiledManifest): string {
  const lines = ["effects:"];
  for (const [effectId, effect] of Object.entries(compiled.manifest.effects)) {
    lines.push(`  - id: ${yamlScalar(effectId)}`);
    lines.push("    output:");
    const fields = normalizeFields(effect.output ?? {});
    if (fields.length === 0) {
      lines.push("      ok: true");
      continue;
    }
    for (const field of fields) {
      lines.push(`      ${field.name}: ${yamlScalar(effectOutputValue(effectId, field))}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function effectOutputValue(effectId: string, field: NormalizedField): unknown {
  if (field.name.toLowerCase().endsWith("id")) {
    return `stub-${effectId.replace(/[^a-z0-9]+/giu, "-")}-${field.name}`;
  }
  if (field.name === "url") {
    return `https://example.test/${effectId.replace(/[^a-z0-9]+/giu, "/")}`;
  }
  if (field.arrayOf) {
    return [];
  }
  if (field.kind === "number") {
    return 1;
  }
  if (field.kind === "boolean") {
    return true;
  }
  if (field.kind === "json") {
    return { stub: true };
  }
  if (field.kind === "enum") {
    return field.enumValues?.[0] ?? "stub";
  }
  return `stub-${field.name}`;
}

function yamlScalar(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return JSON.stringify(value);
  }
  return JSON.stringify(String(value));
}
