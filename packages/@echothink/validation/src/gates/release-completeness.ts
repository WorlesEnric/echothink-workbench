import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Gate, GateFinding } from "../types.js";
import {
  errorFinding,
  gateResult,
  readUtf8,
  skipResult,
} from "./common.js";

export const releaseCompletenessGate: Gate = {
  id: "release-completeness",
  async run(ctx) {
    const releasePath = join(ctx.domainDir, "release.manifest.json");
    if (!existsSync(releasePath)) {
      return skipResult(
        this.id,
        "No release.manifest.json is present; release completeness is skipped for draft validation.",
        "RELEASE_DRAFT",
      );
    }

    let release: unknown;
    try {
      release = JSON.parse(readUtf8(releasePath)) as unknown;
    } catch (error) {
      return gateResult(this.id, [
        errorFinding(
          "RELEASE_PARSE_ERROR",
          error instanceof Error ? error.message : String(error),
          { file: releasePath },
        ),
      ]);
    }

    const findings: GateFinding[] = [];
    if (!isRecord(release)) {
      findings.push(
        errorFinding(
          "RELEASE_INVALID",
          "release.manifest.json must contain a JSON object.",
          { file: releasePath },
        ),
      );
      return gateResult(this.id, findings);
    }

    requireString(release, "domainId", findings, releasePath);
    requireString(release, "version", findings, releasePath);
    requireString(release, "manifestDigest", findings, releasePath);
    requireString(release, "sdkContractVersion", findings, releasePath);
    requireString(release, "runtimeCompatibility", findings, releasePath);
    requireString(release, "validationReport", findings, releasePath);
    if (!hasStringish(release, ["changelog", "changelogRef", "changelogPath", "releaseNotes"])) {
      findings.push(
        errorFinding(
          "RELEASE_CHANGELOG_MISSING",
          "Release manifest must reference a changelog or release notes.",
          { file: releasePath },
        ),
      );
    }
    if (!hasOwner(release)) {
      findings.push(
        errorFinding(
          "RELEASE_OWNER_MISSING",
          "Release manifest must declare owners.",
          { file: releasePath },
        ),
      );
    }
    if (!isRecord(release.surfaceDigests) || Object.keys(release.surfaceDigests).length === 0) {
      findings.push(
        errorFinding(
          "RELEASE_SURFACE_HASHES_MISSING",
          "Release manifest must declare non-empty surfaceDigests.",
          { file: releasePath },
        ),
      );
    }
    if (!hasApprovals(release)) {
      findings.push(
        errorFinding(
          "RELEASE_APPROVALS_MISSING",
          "Release manifest must declare approvers or approvals.",
          { file: releasePath },
        ),
      );
    }
    if (!isRecord(release.rollback) || typeof release.rollback.safeRollback !== "boolean") {
      findings.push(
        errorFinding(
          "RELEASE_ROLLBACK_MISSING",
          "Release manifest must declare rollback.safeRollback.",
          { file: releasePath },
        ),
      );
    }

    if (
      typeof release.domainId === "string" &&
      release.domainId !== ctx.compiled.manifest.metadata.id
    ) {
      findings.push(
        errorFinding(
          "RELEASE_DOMAIN_MISMATCH",
          `Release domainId "${release.domainId}" does not match manifest "${ctx.compiled.manifest.metadata.id}".`,
          { file: releasePath },
        ),
      );
    }
    if (
      typeof release.version === "string" &&
      release.version !== ctx.compiled.manifest.metadata.version
    ) {
      findings.push(
        errorFinding(
          "RELEASE_VERSION_MISMATCH",
          `Release version "${release.version}" does not match manifest "${ctx.compiled.manifest.metadata.version}".`,
          { file: releasePath },
        ),
      );
    }

    return gateResult(this.id, findings);
  },
};

function requireString(
  release: Record<string, unknown>,
  field: string,
  findings: GateFinding[],
  file: string,
): void {
  if (typeof release[field] !== "string" || release[field].length === 0) {
    findings.push(
      errorFinding(
        "RELEASE_FIELD_MISSING",
        `Release manifest must declare "${field}".`,
        { file },
      ),
    );
  }
}

function hasStringish(
  release: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.some(
    (field) => typeof release[field] === "string" && release[field].length > 0,
  );
}

function hasOwner(release: Record<string, unknown>): boolean {
  if (typeof release.owner === "string" && release.owner.length > 0) {
    return true;
  }
  return Array.isArray(release.owners) && release.owners.length > 0;
}

function hasApprovals(release: Record<string, unknown>): boolean {
  if (Array.isArray(release.approvals) && release.approvals.length > 0) {
    return true;
  }
  return Array.isArray(release.approvers) && release.approvers.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
