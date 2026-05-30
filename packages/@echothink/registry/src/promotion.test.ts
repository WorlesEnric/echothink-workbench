import { readFileSync } from "node:fs";
import { compileManifest, parseManifestYaml } from "@echothink/domain-manifest";
import type { ApprovalRole } from "@echothink/shared-types";
import { describe, expect, it } from "vitest";
import {
  LEGAL_TRANSITIONS,
  PromotionEngine,
  PromotionError,
  verifyRelease,
} from "./promotion.js";
import { buildRegistryRecordFromCompiled } from "./registry.js";
import { buildReleaseManifest, type ReleaseManifest } from "./release-manifest.js";

const NOW = "2026-05-29T12:00:00.000Z";

describe("PromotionEngine", () => {
  it("allows legal transitions and rejects illegal transitions", () => {
    expect(LEGAL_TRANSITIONS.draft).toEqual(["validated-draft"]);

    const compiled = compileGithubTriage();
    const record = buildRegistryRecordFromCompiled(compiled, {
      owner: "platform-workflows",
      status: "draft",
    });
    const engine = new PromotionEngine();

    expect(engine.transition(record, "validated-draft").status).toBe(
      "validated-draft",
    );
    expect(() => engine.transition(record, "production")).toThrow(PromotionError);
  });

  it("requires release approvals when promoting to approved", () => {
    const compiled = compileGithubTriage();
    const release = buildRelease(compiled);
    const baseRecord = {
      ...buildRegistryRecordFromCompiled(compiled, {
        owner: "platform-workflows",
        status: "release-candidate",
      }),
      release,
      pendingChangeKind: "entity-schema" as const,
    };
    const engine = new PromotionEngine();

    expect(() => engine.transition(baseRecord, "approved")).toThrow(
      /Missing required approvals/,
    );

    const approvedRelease: ReleaseManifest = {
      ...release,
      approvals: [
        approval("domain-owner", "u_domain"),
        approval("platform-architect", "u_platform"),
      ],
    };
    const next = engine.transition(
      {
        ...baseRecord,
        release: approvedRelease,
      },
      "approved",
    );

    expect(next.status).toBe("approved");
    expect(next).not.toBe(baseRecord);
    expect(baseRecord.status).toBe("release-candidate");
  });
});

describe("verifyRelease", () => {
  it("detects a tampered surface digest", () => {
    const compiled = compileGithubTriage();
    const surfaceFiles = fakeSurfaceFiles(compiled.surfaceRegistrations.map((s) => s.id));
    const release = buildReleaseManifest({
      compiled,
      gitCommit: "abc123",
      surfaceFiles,
      sdkContractVersion: "1.2",
      runtimeCompatibility: ">=2.3 <3.0",
      validationReport: "validation/run_2026_05_29_001.json",
    });
    const tampered: ReleaseManifest = {
      ...release,
      surfaceDigests: {
        ...release.surfaceDigests,
        "issues-admin":
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
    };

    const result = verifyRelease(tampered, compiled, surfaceFiles);

    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain(
      "surface digest mismatch for issues-admin",
    );
  });
});

function compileGithubTriage() {
  const yaml = readFileSync(
    new URL(
      "../../../../domains/github-triage/domain.manifest.yaml",
      import.meta.url,
    ),
    "utf8",
  );
  return compileManifest(parseManifestYaml(yaml).manifest, { now: NOW });
}

function buildRelease(compiled: ReturnType<typeof compileGithubTriage>) {
  return buildReleaseManifest({
    compiled,
    gitCommit: "abc123",
    surfaceFiles: fakeSurfaceFiles(compiled.surfaceRegistrations.map((s) => s.id)),
    sdkContractVersion: "1.2",
    runtimeCompatibility: ">=2.3 <3.0",
    validationReport: "validation/run_2026_05_29_001.json",
  });
}

function fakeSurfaceFiles(surfaceIds: string[]): Record<string, string> {
  return Object.fromEntries(
    surfaceIds.map((surfaceId) => [
      surfaceId,
      `export const surfaceId = ${JSON.stringify(surfaceId)};\n`,
    ]),
  );
}

function approval(role: ApprovalRole, user: string) {
  return {
    role,
    user,
    timestamp: "2026-05-29T18:00:00Z",
  };
}
