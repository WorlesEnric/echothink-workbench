import { DefaultReleaseGuard } from "@echothink/app-domain-runtime";
import { readFileSync } from "node:fs";
import { compileManifest, parseManifestYaml, type CompiledManifest } from "@echothink/domain-manifest";
import { describe, expect, it } from "vitest";

const NOW = "2026-05-29T18:00:00.000Z";

function loadCompiled(): CompiledManifest {
  const manifestYaml = readFileSync(new URL("../domain.manifest.yaml", import.meta.url), "utf8");
  return compileManifest(parseManifestYaml(manifestYaml).manifest, {
    now: NOW,
  });
}

function sdkRequest(
  compiled: CompiledManifest,
  capability: "identity.current" | "permissions.can" | "entity.query" | "entity.get" | "process.run" | "event.subscribe" | "audit.annotate" | "effect.invoke",
  target?: string,
  input?: unknown,
) {
  return {
    domainId: compiled.manifest.metadata.id,
    manifestVersion: compiled.manifest.metadata.version,
    surfaceId: "triage-console",
    actorId: "rob-reviewer",
    tenantId: "org_456",
    capability,
    ...(target ? { target } : {}),
    ...(input !== undefined ? { input } : {}),
  };
}

function createClock() {
  return { now: () => NOW };
}

function createIds() {
  let next = 0;
  return {
    next(prefix = "id") {
      next += 1;
      return `${prefix}_${next}`;
    },
  };
}


describe("release governance", () => {
  it("accepts a matching approved release manifest", () => {
    const compiled = loadCompiled();
    const guard = new DefaultReleaseGuard(compiled);
    const result = guard.verify(sdkRequest(compiled, "identity.current"), {
      manifestVersion: compiled.manifest.metadata.version,
      manifestDigest: compiled.manifestDigest,
      sdkContractVersion: compiled.manifest.metadata.sdkContractVersion,
      runtimeCompatibility: compiled.manifest.metadata.sdkContractVersion,
      promotionState: "approved",
      approved: true,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects stale or unapproved release evidence", () => {
    const compiled = loadCompiled();
    const guard = new DefaultReleaseGuard(compiled);
    const result = guard.verify(sdkRequest(compiled, "identity.current"), {
      manifestVersion: compiled.manifest.metadata.version,
      manifestDigest: "sha256:stale",
      sdkContractVersion: compiled.manifest.metadata.sdkContractVersion,
      promotionState: "draft",
      approved: false,
    });

    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        "Release manifest is explicitly unapproved.",
        "Release state draft is not approved for runtime use.",
        "Release manifestDigest does not match compiled manifest.",
      ]),
    );
  });
});
