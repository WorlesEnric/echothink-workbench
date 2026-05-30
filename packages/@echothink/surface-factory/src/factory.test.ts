import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileManifest, parseManifestYaml } from "@echothink/domain-manifest";
import { describe, expect, it } from "vitest";

import { generateDomain, writeDomain } from "./factory.js";

const manifestUrl = new URL(
  "../../../../domains/github-triage/domain.manifest.yaml",
  import.meta.url,
);

describe("surface factory", () => {
  it("generates the github-triage artifact set", () => {
    const manifestYaml = readFileSync(manifestUrl, "utf8");
    const result = generateDomain(manifestYaml, {
      now: "2026-05-29T18:00:00.000Z",
      gitCommit: "abc123",
    });
    const paths = new Set(result.files.map((file) => file.path));

    expect(result.surfacesByType).toEqual({
      standard: [
        "issues-admin",
        "issue-detail",
        "triage-form",
        "audit-log",
        "approval-queue",
      ],
      composed: ["triage-console"],
      custom: [],
    });
    expect(paths.has("domain.manifest.lock.json")).toBe(true);
    expect(paths.has("capability-map.json")).toBe(true);
    expect(paths.has("kernel/generated-types.ts")).toBe(true);
    expect(paths.has("surfaces/standard/issues-admin.surface.yaml")).toBe(true);
    expect(paths.has("surfaces/standard/approval-queue.surface.yaml")).toBe(true);
    expect(paths.has("surfaces/composed/triage-console/index.tsx")).toBe(true);
    expect(paths.has("fixtures/personas.yaml")).toBe(true);
    expect(paths.has("fixtures/sample-entities.json")).toBe(true);
    expect(paths.has("fixtures/effect-stubs.yaml")).toBe(true);
    expect(paths.has("tests/permissions.spec.ts")).toBe(true);
    expect(paths.has("tests/processes.spec.ts")).toBe(true);
    expect(paths.has("tests/effects.spec.ts")).toBe(true);
    expect(paths.has("tests/release.spec.ts")).toBe(true);
    expect(paths.has("docs/domain-brief.md")).toBe(true);
    expect(paths.has("docs/process-map.md")).toBe(true);
    expect(paths.has("docs/release-notes.md")).toBe(true);

    const domainDir = mkdtempSync(join(tmpdir(), "surface-factory-"));
    writeDomain(domainDir, result);
    expect(
      readFileSync(
        join(domainDir, "surfaces/composed/triage-console/index.tsx"),
        "utf8",
      ),
    ).toContain("TaskApprovalPanel");
  });

  it("keeps composed surface imports within the manifest allowlist", () => {
    const manifestYaml = readFileSync(manifestUrl, "utf8");
    const compiled = compileManifest(parseManifestYaml(manifestYaml).manifest, {
      now: "2026-05-29T18:00:00.000Z",
      gitCommit: "abc123",
    });
    const surface = compiled.surfaceRegistrations.find(
      (candidate) => candidate.id === "triage-console",
    );
    if (!surface) {
      throw new Error("triage-console surface was not compiled");
    }
    const result = generateDomain(manifestYaml, {
      now: "2026-05-29T18:00:00.000Z",
      gitCommit: "abc123",
    });
    const index = result.files.find(
      (file) => file.path === "surfaces/composed/triage-console/index.tsx",
    );
    if (!index) {
      throw new Error("triage-console index was not generated");
    }

    const imports = importedModules(index.contents).filter(
      (moduleId) => !moduleId.startsWith("."),
    );
    const allowedImports = surface.allowedImports ?? [];
    expect(imports.every((moduleId) => isImportAllowed(moduleId, allowedImports)))
      .toBe(true);
    expect(index.contents).not.toMatch(/\bfetch\s*\(/u);
    expect(index.contents).not.toMatch(/\bnew\s+WebSocket\b/u);
    expect(index.contents).not.toMatch(/\bprocess\.env\b/u);
  });
});

function importedModules(contents: string): string[] {
  const modules = new Set<string>();
  const importPattern =
    /import(?:\s+type)?(?:\s+[\s\S]*?\s+from)?\s+["']([^"']+)["']/gu;
  for (const match of contents.matchAll(importPattern)) {
    const moduleId = match[1];
    if (moduleId) {
      modules.add(moduleId);
    }
  }
  return [...modules].sort();
}

function isImportAllowed(
  moduleId: string,
  allowedImports: readonly string[],
): boolean {
  return allowedImports.some(
    (allowed) => moduleId === allowed || moduleId.startsWith(`${allowed}/`),
  );
}
