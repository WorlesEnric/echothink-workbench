import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { generateDomain, writeDomain } from "./factory.js";

const manifestUrl = new URL(
  "../../../../domains/github-triage/domain.manifest.yaml",
  import.meta.url,
);

describe("QA evidence generation", () => {
  it("writes accessibility and visual evidence for github-triage surfaces", () => {
    const manifestYaml = readFileSync(manifestUrl, "utf8");
    const result = generateDomain(manifestYaml, {
      now: "2026-05-29T18:00:00.000Z",
      gitCommit: "abc123",
    });
    const domainDir = mkdtempSync(join(tmpdir(), "surface-factory-qa-"));

    writeDomain(domainDir, result);

    const a11yConfigPath = join(domainDir, "a11y.config.ts");
    const visualSnapshotPath = join(
      domainDir,
      "tests/visual/triage-console.snap.json",
    );

    expect(existsSync(a11yConfigPath)).toBe(true);
    expect(existsSync(visualSnapshotPath)).toBe(true);

    const a11yConfig = readFileSync(a11yConfigPath, "utf8");
    expect(a11yConfig).toContain('engine: "axe-core"');
    expect(a11yConfig).toContain('surfaceId: "triage-console"');

    const visualSnapshot = JSON.parse(
      readFileSync(visualSnapshotPath, "utf8"),
    ) as Record<string, unknown>;
    expect(visualSnapshot).toMatchObject({
      surfaceId: "triage-console",
      viewport: "desktop",
      capturedStates: ["default", "empty", "error"],
    });
    expect(visualSnapshot.hash).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });
});
