import type { CompiledManifest, NormalizedEntity } from "@echothink/domain-manifest";

import type { GeneratedFile } from "./types.js";
import { titleCase } from "./utils.js";

export function generateDocs(compiled: CompiledManifest): GeneratedFile[] {
  return [
    {
      path: "docs/domain-brief.md",
      contents: renderDomainBrief(compiled),
    },
    {
      path: "docs/process-map.md",
      contents: renderProcessMap(compiled),
    },
    {
      path: "docs/release-notes.md",
      contents: renderReleaseNotes(compiled),
    },
  ];
}

function renderDomainBrief(compiled: CompiledManifest): string {
  const manifest = compiled.manifest;
  const lines: string[] = [];
  lines.push(`# ${manifest.metadata.name}`);
  lines.push("");
  lines.push(manifest.metadata.description ?? "No description provided.");
  lines.push("");
  lines.push("## Ownership");
  lines.push("");
  lines.push(`- Domain ID: \`${manifest.metadata.id}\``);
  lines.push(`- Owner: \`${manifest.metadata.owner}\``);
  lines.push(`- Version: \`${manifest.metadata.version}\``);
  lines.push(`- SDK contract: \`${manifest.metadata.sdkContractVersion}\``);
  lines.push(`- UI registry: \`${manifest.metadata.uiRegistryVersion}\``);
  lines.push("");
  lines.push("## Entities");
  lines.push("");
  for (const entity of compiled.normalizedEntities) {
    lines.push(`- \`${entity.name}\` (${entity.tenantScope} scope): ${entity.fields.map((field) => `\`${field.name}\``).join(", ")}`);
  }
  lines.push("");
  lines.push("## Surfaces");
  lines.push("");
  for (const surface of compiled.surfaceRegistrations) {
    lines.push(`- \`${surface.id}\` (${surface.type}) at \`${surface.route}\``);
  }
  lines.push("");
  lines.push("## External Effects");
  lines.push("");
  const effectIds = Object.keys(manifest.effects);
  if (effectIds.length === 0) {
    lines.push("- None");
  } else {
    for (const [effectId, effect] of Object.entries(manifest.effects)) {
      const hosts = effect.egress?.allowHosts.join(", ") ?? "none declared";
      lines.push(`- \`${effectId}\` owned by \`${effect.owner ?? "unknown"}\`; egress: ${hosts}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderProcessMap(compiled: CompiledManifest): string {
  const lines: string[] = [];
  lines.push(`# ${compiled.manifest.metadata.name} Process Map`);
  lines.push("");
  for (const entity of compiled.normalizedEntities) {
    lines.push(`## ${entity.name}`);
    lines.push("");
    lines.push("```mermaid");
    lines.push("stateDiagram-v2");
    renderStateMachine(lines, entity);
    lines.push("```");
    lines.push("");
  }
  lines.push("## Unit Processes");
  lines.push("");
  for (const process of compiled.normalizedProcesses) {
    lines.push(`- \`${process.id}\`: ${process.reads.join(", ") || "no reads"} -> ${process.writes.join(", ") || "no writes"}; emits ${process.emits.join(", ") || "none"}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderStateMachine(lines: string[], entity: NormalizedEntity): void {
  if (!entity.stateMachine) {
    lines.push(`  [*] --> ${titleCase(entity.name).replace(/\s+/gu, "")}`);
    return;
  }
  lines.push(`  [*] --> ${entity.stateMachine.initial}`);
  for (const transition of entity.stateMachine.transitions) {
    const label = transition.via ? ` : ${transition.via}` : "";
    lines.push(`  ${transition.from} --> ${transition.to}${label}`);
  }
}

function renderReleaseNotes(compiled: CompiledManifest): string {
  const manifest = compiled.manifest;
  const lines: string[] = [];
  lines.push(`# Release Notes`);
  lines.push("");
  lines.push(`## ${manifest.metadata.version} (${manifest.release.channel})`);
  lines.push("");
  lines.push(`Generated at \`${compiled.compiledAt}\`.`);
  lines.push("");
  lines.push("### Included Artifacts");
  lines.push("");
  lines.push("- Manifest lockfile and capability map");
  lines.push("- Kernel TypeScript contracts");
  lines.push("- Standard and composed surface artifacts");
  lines.push("- Preview fixtures and governance tests");
  lines.push("");
  lines.push("### Required Approvals");
  lines.push("");
  for (const approval of manifest.release.requiredApprovals) {
    lines.push(`- \`${approval}\``);
  }
  return `${lines.join("\n")}\n`;
}
