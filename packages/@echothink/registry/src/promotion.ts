import type { CompiledManifest } from "@echothink/domain-manifest";
import {
  sha256OfString,
  type ApprovalRole,
  type PromotionState,
} from "@echothink/shared-types";
import type { RegistryRecord } from "./registry.js";
import type { ReleaseManifest } from "./release-manifest.js";
import { computeCompiledManifestDigest } from "./release-manifest.js";

export type ChangeKind =
  | "standard-copy"
  | "entity-schema"
  | "permission"
  | "process-mutation"
  | "state-transition"
  | "new-effect"
  | "new-dependency"
  | "composed-release"
  | "custom-release"
  | "production-promotion"
  | "emergency-rollback";

export const LEGAL_TRANSITIONS: Record<PromotionState, PromotionState[]> = {
  draft: ["validated-draft"],
  "validated-draft": ["release-candidate"],
  "release-candidate": ["approved"],
  approved: ["canary", "rolled-back"],
  canary: ["production", "rolled-back"],
  production: ["deprecated", "rolled-back"],
  deprecated: [],
  "rolled-back": [],
};

export const REQUIRED_APPROVALS: Record<ChangeKind, ApprovalRole[]> = {
  "standard-copy": ["domain-owner"],
  "entity-schema": ["domain-owner", "platform-architect"],
  permission: ["domain-owner", "platform-architect"],
  "process-mutation": ["domain-owner", "platform-architect"],
  "state-transition": ["domain-owner", "platform-architect"],
  "new-effect": ["security", "integration-owner", "platform-architect"],
  "new-dependency": ["platform-architect"],
  "composed-release": ["domain-owner", "platform-architect"],
  "custom-release": ["domain-owner", "platform-architect", "security"],
  "production-promotion": ["release-manager"],
  "emergency-rollback": ["release-manager"],
};

export interface PromotionEvidence {
  changeKind?: ChangeKind;
  release?: ReleaseManifest;
  validationReport?: string;
}

export class PromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromotionError";
  }
}

export class PromotionEngine {
  transition(
    record: RegistryRecord,
    to: PromotionState,
    evidence: PromotionEvidence = {},
  ): RegistryRecord {
    const legalTargets = LEGAL_TRANSITIONS[record.status];
    if (!legalTargets.includes(to)) {
      throw new PromotionError(
        `Illegal promotion transition: ${record.status} -> ${to}`,
      );
    }

    const requiredApprovals = requiredApprovalsForTransition(record, to, evidence);
    assertReleaseApprovals(record, evidence, requiredApprovals, to);

    return {
      ...record,
      status: to,
      versions: [...record.versions],
      surfaces: record.surfaces.map((surface) => ({ ...surface })),
      capabilities: [...record.capabilities],
      approvals: { ...record.approvals },
      ...(evidence.release ? { release: evidence.release } : {}),
    };
  }
}

export interface ReleaseVerificationResult {
  ok: boolean;
  problems: string[];
}

export function verifyRelease(
  release: ReleaseManifest,
  compiled: CompiledManifest,
  surfaceFiles: Record<string, string>,
): ReleaseVerificationResult {
  const problems: string[] = [];
  const recomputedManifestDigest = computeCompiledManifestDigest(compiled);

  if (release.manifestDigest !== recomputedManifestDigest) {
    problems.push(
      `manifestDigest mismatch: expected ${recomputedManifestDigest}, got ${release.manifestDigest}`,
    );
  }

  if (compiled.manifestDigest !== recomputedManifestDigest) {
    problems.push(
      `compiled manifestDigest mismatch: expected ${recomputedManifestDigest}, got ${compiled.manifestDigest}`,
    );
  }

  if (release.version !== compiled.manifest.metadata.version) {
    problems.push(
      `version mismatch: expected ${compiled.manifest.metadata.version}, got ${release.version}`,
    );
  }

  for (const surface of compiled.surfaceRegistrations) {
    if (!(surface.id in release.surfaceDigests)) {
      problems.push(`missing release surface digest for ${surface.id}`);
    }
    if (!(surface.id in surfaceFiles)) {
      problems.push(`missing surface file for ${surface.id}`);
    }
  }

  for (const [surfaceId, contents] of Object.entries(surfaceFiles)) {
    const expectedDigest = release.surfaceDigests[surfaceId];
    if (!expectedDigest) {
      problems.push(`unexpected surface file ${surfaceId}`);
      continue;
    }

    const actualDigest = sha256OfString(contents);
    if (actualDigest !== expectedDigest) {
      problems.push(
        `surface digest mismatch for ${surfaceId}: expected ${expectedDigest}, got ${actualDigest}`,
      );
    }
  }

  return {
    ok: problems.length === 0,
    problems,
  };
}

function requiredApprovalsForTransition(
  record: RegistryRecord,
  to: PromotionState,
  evidence: PromotionEvidence,
): ApprovalRole[] {
  if (to === "approved") {
    const changeKind =
      evidence.changeKind ?? record.pendingChangeKind ?? "standard-copy";
    return REQUIRED_APPROVALS[changeKind];
  }
  if (to === "production") {
    return REQUIRED_APPROVALS["production-promotion"];
  }
  if (to === "rolled-back") {
    return REQUIRED_APPROVALS["emergency-rollback"];
  }
  return [];
}

function assertReleaseApprovals(
  record: RegistryRecord,
  evidence: PromotionEvidence,
  requiredApprovals: ApprovalRole[],
  targetState: PromotionState,
): void {
  if (requiredApprovals.length === 0) {
    return;
  }

  const release = evidence.release ?? record.release;
  if (!release) {
    throw new PromotionError(
      `Missing release evidence for ${targetState} promotion approvals`,
    );
  }

  const grantedRoles = new Set(release.approvals.map((approval) => approval.role));
  const missing = requiredApprovals.filter((role) => !grantedRoles.has(role));
  if (missing.length > 0) {
    throw new PromotionError(
      `Missing required approvals for ${targetState}: ${missing.join(", ")}`,
    );
  }
}
