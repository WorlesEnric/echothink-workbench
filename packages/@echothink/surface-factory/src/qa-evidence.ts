import type { CompiledManifest, SurfaceRegistration } from "@echothink/domain-manifest";
import { sha256OfString } from "@echothink/shared-types";

import type { GeneratedFile } from "./types.js";
import { literal, stableJson } from "./utils.js";

const CAPTURED_STATES = ["default", "empty", "error"] as const;

type QaEvidenceSurface = SurfaceRegistration & { type: "composed" | "custom" };

export function generateQaEvidence(compiled: CompiledManifest): GeneratedFile[] {
  const surfaces = compiled.surfaceRegistrations.filter(isQaEvidenceSurface);
  if (surfaces.length === 0) {
    return [];
  }

  return [
    {
      path: "a11y.config.ts",
      contents: renderA11yConfig(surfaces),
    },
    ...surfaces.map((surface) => ({
      path: `tests/visual/${surface.id}.snap.json`,
      contents: renderVisualSnapshot(surface.id),
    })),
  ];
}

function isQaEvidenceSurface(
  surface: SurfaceRegistration,
): surface is QaEvidenceSurface {
  return surface.type === "composed" || surface.type === "custom";
}

function renderA11yConfig(surfaces: readonly QaEvidenceSurface[]): string {
  const lines: string[] = [];
  lines.push("interface AxeRuleSetting {");
  lines.push("  enabled: boolean;");
  lines.push("}");
  lines.push("");
  lines.push("interface AccessibilityScanTarget {");
  lines.push("  surfaceId: string;");
  lines.push("  route: string;");
  lines.push('  type: "composed" | "custom";');
  lines.push("}");
  lines.push("");
  lines.push("interface AccessibilityEvidenceConfig {");
  lines.push('  engine: "axe-core";');
  lines.push("  rules: Record<string, AxeRuleSetting>;");
  lines.push("  surfaces: AccessibilityScanTarget[];");
  lines.push("}");
  lines.push("");
  lines.push("export const accessibilityEvidenceConfig: AccessibilityEvidenceConfig = {");
  lines.push('  engine: "axe-core",');
  lines.push("  rules: {");
  lines.push('    "aria-allowed-attr": { enabled: true },');
  lines.push('    "button-name": { enabled: true },');
  lines.push('    "color-contrast": { enabled: true },');
  lines.push('    "image-alt": { enabled: true },');
  lines.push('    "label": { enabled: true },');
  lines.push("  },");
  lines.push("  surfaces: [");
  for (const surface of surfaces) {
    lines.push("    {");
    lines.push(`      surfaceId: ${literal(surface.id)},`);
    lines.push(`      route: ${literal(surface.route)},`);
    lines.push(`      type: ${literal(surface.type)},`);
    lines.push("    },");
  }
  lines.push("  ],");
  lines.push("};");
  lines.push("");
  lines.push("export default accessibilityEvidenceConfig;");
  return `${lines.join("\n")}\n`;
}

function renderVisualSnapshot(surfaceId: string): string {
  return stableJson({
    surfaceId,
    viewport: "desktop",
    capturedStates: CAPTURED_STATES,
    hash: sha256OfString(`${surfaceId}:${CAPTURED_STATES.join(",")}`),
  });
}
