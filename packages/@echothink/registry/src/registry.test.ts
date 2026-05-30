import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileManifest, parseManifestYaml } from "@echothink/domain-manifest";
import { describe, expect, it } from "vitest";
import {
  AppDomainRegistry,
  buildRegistryRecordFromCompiled,
  createJsonRegistryStore,
} from "./registry.js";

const NOW = "2026-05-29T12:00:00.000Z";

describe("AppDomainRegistry", () => {
  it("registers, gets, and lists records", () => {
    const record = buildRegistryRecordFromCompiled(compileGithubTriage(), {
      owner: "platform-workflows",
      status: "production",
    });
    const registry = new AppDomainRegistry();

    registry.register(record);

    expect(registry.get("github-triage")).toEqual(record);
    expect(registry.list()).toEqual([record]);
  });

  it("builds records with flattened capabilities", () => {
    const record = buildRegistryRecordFromCompiled(compileGithubTriage(), {
      owner: "platform-workflows",
      status: "production",
    });

    expect(record.capabilities).toContain("process.run:issue.triage");
    expect(record.capabilities).toContain("effect:github.issue.comment");
    expect(record.surfaces).toContainEqual({
      id: "issues-admin",
      type: "standard",
      route: "/github/issues",
    });
  });

  it("round-trips a JSON registry store", async () => {
    const dir = mkdtempSync(join(tmpdir(), "echothink-registry-"));
    const path = join(dir, "registry.json");
    const store = createJsonRegistryStore(path);
    const record = buildRegistryRecordFromCompiled(compileGithubTriage(), {
      owner: "platform-workflows",
      status: "production",
    });

    try {
      await store.save([record]);
      await expect(store.load()).resolves.toEqual([record]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
