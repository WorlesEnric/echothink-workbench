import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileManifest, parseManifestYaml } from "@echothink/domain-manifest";

import { uiRegistry } from "./registry.js";

const manifestPath = fileURLToPath(
  new URL("../../../../domains/github-triage/domain.manifest.yaml", import.meta.url),
);
const { manifest } = parseManifestYaml(readFileSync(manifestPath, "utf8"));
const compiled = compileManifest(manifest, {
  now: "2026-05-29T00:00:00.000Z",
});

function renderSurface(surfaceId: string): string {
  const surface = compiled.surfaceRegistrations.find(
    (candidate) => candidate.id === surfaceId,
  );
  if (!surface) {
    throw new Error(`Missing surface ${surfaceId}`);
  }
  const [file] = uiRegistry.renderStandardSurface({ compiled, surface });
  expect(file?.path).toBe(`surfaces/standard/${surfaceId}.surface.yaml`);
  return file?.contents ?? "";
}

describe("standard surface templates", () => {
  it("renders the github issues table from entity and query bindings", () => {
    const content = renderSurface("issues-admin");

    expect(content).toContain("DataTable");
    expect(content).toContain('"@echothink-ui/data"');
    expect(content).toContain("issue.openQueue");
    expect(content).toContain("requiredPermissions:\n  - issue.read");
    for (const field of [
      "id",
      "repo",
      "title",
      "state",
      "labels",
      "priority",
      "createdAt",
    ]) {
      expect(content).toContain(`name: ${field}`);
    }
  });

  it("renders the github issue detail surface from the Issue schema", () => {
    const content = renderSurface("issue-detail");

    expect(content).toContain("EntityDetail");
    expect(content).toContain("PropertyList");
    expect(content).toContain("Issue");
    expect(content).toContain("name: title");
    expect(content).toContain("name: priority");
    expect(content).toContain("requiredPermissions:\n  - issue.read");
  });

  it("renders the triage form from the issue.triage process input", () => {
    const content = renderSurface("triage-form");

    expect(content).toContain("EntityForm");
    expect(content).toContain("SchemaForm");
    expect(content).toContain("issue.triage");
    expect(content).toContain("name: issueId");
    expect(content).toContain("name: priority");
    expect(content).toContain("name: labels");
    expect(content).toContain("requiredPermissions:\n  - issue.read\n  - issue.triage");
  });

  it("renders deterministically", () => {
    expect(renderSurface("issues-admin")).toBe(renderSurface("issues-admin"));
    expect(renderSurface("issue-detail")).toBe(renderSurface("issue-detail"));
    expect(renderSurface("triage-form")).toBe(renderSurface("triage-form"));
  });
});
