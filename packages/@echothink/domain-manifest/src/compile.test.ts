import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AppDomainManifestSchema, type AppDomainManifest } from "./schema.js";
import { compileManifest } from "./compile.js";
import { parseManifestYaml } from "./parse.js";

const fixtureYaml = readFileSync(
  new URL("./__fixtures__/github-triage.manifest.yaml", import.meta.url),
  "utf8",
);
const NOW = "2026-05-29T12:00:00.000Z";

describe("compileManifest", () => {
  it("compiles github-triage with expected permissions", () => {
    const compiled = compileManifest(parseManifestYaml(fixtureYaml).manifest, {
      now: NOW,
    });

    expect(compiled.normalizedEntities).toHaveLength(1);
    expect(compiled.normalizedProcesses.map((process) => process.id)).toContain(
      "issue.triage",
    );

    expect(compiled.permissionMatrix).toContainEqual({
      role: "viewer",
      capability: "entity.query",
      target: "issue.openQueue",
      permission: "issue.read",
      allowed: true,
    });
    expect(compiled.permissionMatrix).toContainEqual({
      role: "viewer",
      capability: "process.run",
      target: "issue.triage",
      permission: "issue.triage",
      allowed: false,
    });
  });

  it("builds the capability map", () => {
    const compiled = compileManifest(parseManifestYaml(fixtureYaml).manifest, {
      now: NOW,
    });

    expect(compiled.capabilityMap.processes).toContain("process.run:issue.triage");
    expect(compiled.capabilityMap.effects).toContain("effect:github.issue.comment");
  });

  it("computes deterministic manifest digests that change with manifest content", () => {
    const manifest = parseManifestYaml(fixtureYaml).manifest;
    const first = compileManifest(manifest, { now: NOW });
    const second = compileManifest(manifest, { now: NOW });
    expect(second.manifestDigest).toBe(first.manifestDigest);

    const changed = cloneManifest(manifest);
    changed.metadata.version = "0.4.1";
    const changedCompiled = compileManifest(changed, { now: NOW });
    expect(changedCompiled.manifestDigest).not.toBe(first.manifestDigest);
  });
});

function cloneManifest(manifest: AppDomainManifest): AppDomainManifest {
  return AppDomainManifestSchema.parse(JSON.parse(JSON.stringify(manifest)));
}
