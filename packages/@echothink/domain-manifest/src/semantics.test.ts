import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AppDomainManifestSchema, type AppDomainManifest } from "./schema.js";
import { parseManifestYaml } from "./parse.js";
import { validateManifestSemantics } from "./semantics.js";

const fixtureYaml = readFileSync(
  new URL("./__fixtures__/github-triage.manifest.yaml", import.meta.url),
  "utf8",
);

describe("validateManifestSemantics", () => {
  it("passes clean on github-triage", () => {
    const { manifest } = parseManifestYaml(fixtureYaml);

    expect(validateManifestSemantics(manifest)).toEqual([]);
  });

  it("flags dangling permission, entity, event, and effect references", () => {
    const manifest = loadFixture();
    const process = manifest.unitProcesses["issue.triage"];
    if (!process) {
      throw new Error("Missing issue.triage process");
    }
    process.requires = { permission: "issue.missing" };
    process.reads = ["MissingEntity"];
    process.emits = ["issue.missing_event"];
    process.effects = ["github.issue.missing"];

    const diagnostics = validateManifestSemantics(manifest);
    expect(codes(diagnostics)).toContain("UNKNOWN_PERMISSION");
    expect(codes(diagnostics)).toContain("DANGLING_ENTITY_REF");
    expect(codes(diagnostics)).toContain("UNKNOWN_EVENT");
    expect(codes(diagnostics)).toContain("UNKNOWN_EFFECT");
  });

  it("flags duplicate ids", () => {
    const manifest = loadFixture();
    const firstPermission = manifest.permissions[0];
    const firstRole = manifest.identity.roles[0];
    const firstSurface = manifest.surfaces[0];
    if (!firstPermission || !firstRole || !firstSurface) {
      throw new Error("Fixture missing duplicate test inputs");
    }
    manifest.permissions.push({
      id: firstPermission.id,
      roles: [...firstPermission.roles],
    });
    manifest.identity.roles.push({
      id: firstRole.id,
      name: "Duplicate",
    });
    manifest.surfaces.push({
      ...firstSurface,
      route: "/duplicate",
    });

    const diagnostics = validateManifestSemantics(manifest);
    expect(codes(diagnostics).filter((code) => code === "DUPLICATE_ID")).toHaveLength(3);
  });

  it("flags unknown states", () => {
    const manifest = loadFixture();
    const process = manifest.unitProcesses["issue.triage"];
    const entity = manifest.entities.Issue;
    if (!process || !entity?.stateMachine) {
      throw new Error("Fixture missing state transition test inputs");
    }
    process.transitions = {
      "Issue.state": {
        from: "open",
        to: "not_a_state",
      },
    };
    entity.stateMachine.transitions[0] = {
      from: "open",
      to: "also_not_a_state",
      via: "issue.triage",
    };

    const diagnostics = validateManifestSemantics(manifest);
    expect(codes(diagnostics).filter((code) => code === "UNKNOWN_STATE")).toHaveLength(2);
  });
});

function loadFixture(): AppDomainManifest {
  return cloneManifest(parseManifestYaml(fixtureYaml).manifest);
}

function cloneManifest(manifest: AppDomainManifest): AppDomainManifest {
  return AppDomainManifestSchema.parse(JSON.parse(JSON.stringify(manifest)));
}

function codes(diagnostics: Array<{ code: string }>): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}
