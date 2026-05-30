import type {
  CompiledManifest,
  SurfaceRegistration,
} from "@echothink/domain-manifest";
import type { SurfaceType } from "@echothink/shared-types";

export type GateId =
  | "manifest-schema"
  | "manifest-semantic"
  | "typescript"
  | "build"
  | "permission-simulation"
  | "entity-contract"
  | "process-contract"
  | "security-imports"
  | "dependency-allowlist"
  | "effect-simulation"
  | "storybook"
  | "accessibility"
  | "visual"
  | "release-completeness";

export interface GateResult {
  gate: GateId;
  status: "pass" | "fail" | "skip";
  surfaceType?: SurfaceType;
  findings: Array<{
    severity: "error" | "warning";
    message: string;
    file?: string;
    line?: number;
    code: string;
  }>;
  durationMs: number;
}

export interface ValidationReport {
  runId: string;
  domainId: string;
  version: string;
  createdAt: string;
  surfaceTypeProfile: Record<string, SurfaceType>;
  gates: GateResult[];
  overall: "pass" | "fail";
}

export interface Gate {
  id: GateId;
  run(ctx: GateContext): Promise<GateResult>;
}

export interface GateContext {
  domainDir: string;
  compiled: CompiledManifest;
  surfaces: SurfaceRegistration[];
  runId: string;
  now: string;
}

export type GateFinding = GateResult["findings"][number];
