import type { SurfaceType } from "@echothink/shared-types";
import type { ChangeKind } from "./promotion.js";
import type { Sha256 } from "@echothink/shared-types";

export interface FormatCommitMessageInput {
  domainId: string;
  runId: string;
  agent: string;
  manifestDigest: Sha256;
  validation: string;
  surfaceType: SurfaceType;
}

export type VersionImpact = "patch" | "minor" | "major" | "minor+security";

export function formatCommitMessage(input: FormatCommitMessageInput): string {
  return [
    `Domain: ${input.domainId}`,
    `Workbench Run: ${input.runId}`,
    `Agent: ${input.agent}`,
    `Manifest Digest: ${input.manifestDigest}`,
    `Validation: ${input.validation}`,
    `Surface Type: ${input.surfaceType}`,
  ].join("\n");
}

export function versionImpact(change: ChangeKind): VersionImpact {
  switch (change) {
    case "standard-copy":
      return "patch";
    case "composed-release":
      return "minor";
    case "entity-schema":
    case "permission":
    case "process-mutation":
    case "state-transition":
      return "major";
    case "new-effect":
    case "new-dependency":
    case "custom-release":
      return "minor+security";
    case "production-promotion":
    case "emergency-rollback":
      return "patch";
  }
}
