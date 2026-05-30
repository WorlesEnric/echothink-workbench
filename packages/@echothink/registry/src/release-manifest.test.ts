import { readFileSync } from "node:fs";
import { compileManifest, parseManifestYaml } from "@echothink/domain-manifest";
import { sha256OfString } from "@echothink/shared-types";
import { describe, expect, it } from "vitest";
import { buildReleaseManifest } from "./release-manifest.js";

const NOW = "2026-05-29T12:00:00.000Z";

describe("buildReleaseManifest", () => {
  it("builds a deterministic release manifest from a compiled manifest", () => {
    const compiled = compileGithubTriage();
    const surfaceFiles = fakeSurfaceFiles(compiled.surfaceRegistrations.map((s) => s.id));

    const first = buildReleaseManifest({
      compiled,
      gitCommit: "abc123",
      surfaceFiles,
      sdkContractVersion: "1.2",
      runtimeCompatibility: ">=2.3 <3.0",
      validationReport: "validation/run_2026_05_29_001.json",
      previousVersion: "0.3.2",
    });
    const second = buildReleaseManifest({
      compiled,
      gitCommit: "abc123",
      surfaceFiles,
      sdkContractVersion: "1.2",
      runtimeCompatibility: ">=2.3 <3.0",
      validationReport: "validation/run_2026_05_29_001.json",
      previousVersion: "0.3.2",
    });

    expect(first).toEqual(second);
    expect(first.domainId).toBe("github-triage");
    expect(first.version).toBe("0.4.0");
    expect(first.manifestDigest).toBe(compiled.manifestDigest);
    expect(first.surfaceDigests["issues-admin"]).toBe(
      sha256OfString(surfaceFiles["issues-admin"] ?? ""),
    );
    expect(first.rollback).toEqual({
      previousVersion: "0.3.2",
      safeRollback: true,
    });
    expect(first.approvals).toEqual([]);
    expect(first.signature).toBeUndefined();
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

function fakeSurfaceFiles(surfaceIds: string[]): Record<string, string> {
  return Object.fromEntries(
    surfaceIds.map((surfaceId) => [
      surfaceId,
      `export const surfaceId = ${JSON.stringify(surfaceId)};\n`,
    ]),
  );
}
