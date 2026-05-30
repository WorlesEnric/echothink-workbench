import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileManifest } from "./compile.js";
import { generateKernel } from "./codegen.js";
import { parseManifestYaml } from "./parse.js";

const fixtureYaml = readFileSync(
  new URL("./__fixtures__/github-triage.manifest.yaml", import.meta.url),
  "utf8",
);

describe("generateKernel", () => {
  it("emits all expected files", () => {
    const files = generateKernel(
      compileManifest(parseManifestYaml(fixtureYaml).manifest, {
        now: "2026-05-29T12:00:00.000Z",
      }),
    );

    expect(files.map((file) => file.path).sort()).toEqual([
      "capability-map.json",
      "domain.manifest.lock.json",
      "kernel/entity-contracts.generated.ts",
      "kernel/generated-types.ts",
      "kernel/permission-matrix.generated.ts",
      "kernel/process-contracts.generated.ts",
    ]);
  });

  it("emits a sensible generated-types surface", () => {
    const files = generateKernel(
      compileManifest(parseManifestYaml(fixtureYaml).manifest, {
        now: "2026-05-29T12:00:00.000Z",
      }),
    );
    const generatedTypes = files.find(
      (file) => file.path === "kernel/generated-types.ts",
    );
    if (!generatedTypes) {
      throw new Error("Missing generated-types.ts");
    }

    expect(generatedTypes.contents).toContain("export interface GitHubTriageDomain");
    expect(generatedTypes.contents).toContain(
      'state: "open" | "triaged" | "assigned" | "closed";',
    );
    expect(generatedTypes.contents).toContain("assignee: string | null;");
    expect(generatedTypes.contents).toContain("labels: string[];");
    expect(generatedTypes.contents).toContain('"issue.triage"');
    expect(generatedTypes.contents).toMatchSnapshot();
  });
});
