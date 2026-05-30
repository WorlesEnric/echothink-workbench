import type { SurfaceType } from "@echothink/shared-types";
import type { GateId } from "./types.js";

export type GateApplicability = "required" | "conditional" | "skip";

export const GATE_IDS = [
  "manifest-schema",
  "manifest-semantic",
  "typescript",
  "build",
  "permission-simulation",
  "entity-contract",
  "process-contract",
  "security-imports",
  "dependency-allowlist",
  "effect-simulation",
  "storybook",
  "accessibility",
  "visual",
  "release-completeness",
] as const satisfies readonly GateId[];

export const GATE_MATRIX: Record<
  SurfaceType,
  Record<GateId, GateApplicability>
> = {
  standard: {
    "manifest-schema": "required",
    "manifest-semantic": "required",
    typescript: "conditional",
    build: "required",
    "permission-simulation": "required",
    "entity-contract": "required",
    "process-contract": "required",
    "security-imports": "conditional",
    "dependency-allowlist": "conditional",
    "effect-simulation": "conditional",
    storybook: "required",
    accessibility: "required",
    visual: "required",
    "release-completeness": "required",
  },
  composed: {
    "manifest-schema": "required",
    "manifest-semantic": "required",
    typescript: "required",
    build: "required",
    "permission-simulation": "required",
    "entity-contract": "required",
    "process-contract": "required",
    "security-imports": "required",
    "dependency-allowlist": "required",
    "effect-simulation": "conditional",
    storybook: "required",
    accessibility: "required",
    visual: "required",
    "release-completeness": "required",
  },
  custom: {
    "manifest-schema": "required",
    "manifest-semantic": "required",
    typescript: "required",
    build: "required",
    "permission-simulation": "required",
    "entity-contract": "required",
    "process-contract": "required",
    "security-imports": "required",
    "dependency-allowlist": "required",
    "effect-simulation": "required",
    storybook: "required",
    accessibility: "required",
    visual: "required",
    "release-completeness": "required",
  },
};

export function applicableGates(surfaceType: SurfaceType): GateId[] {
  return GATE_IDS.filter((gate) => GATE_MATRIX[surfaceType][gate] !== "skip");
}

export function requiresGate(surfaceType: SurfaceType, gate: GateId): boolean {
  return GATE_MATRIX[surfaceType][gate] === "required";
}
