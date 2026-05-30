import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileManifest,
  parseManifestYaml,
} from "@echothink/domain-manifest";
import { accessibilityGate } from "./gates/accessibility.js";
import { visualGate } from "./gates/visual.js";
import type { GateContext } from "./types.js";

const NOW = "2026-05-29T12:00:00.000Z";
const fixtureManifest = readFileSync(
  new URL("../../../../domains/github-triage/domain.manifest.yaml", import.meta.url),
  "utf8",
);

describe("accessibilityGate", () => {
  it("passes with a root accessibility config", async () => {
    const ctx = createEvidenceContext();
    writeFileSync(join(ctx.domainDir, "accessibility.config.ts"), "export {};\n");

    const result = await accessibilityGate.run(ctx);
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("fails when composed surface accessibility evidence is missing", async () => {
    const result = await accessibilityGate.run(createEvidenceContext());

    expect(result.status).toBe("fail");
    expect(result.findings).toEqual([
      expect.objectContaining({ code: "ACCESSIBILITY_CONFIG_MISSING" }),
    ]);
  });
});

describe("visualGate", () => {
  it("passes with a canonical tests/visual snapshot artifact", async () => {
    const ctx = createEvidenceContext();
    mkdirSync(join(ctx.domainDir, "tests", "visual"), { recursive: true });
    writeFileSync(join(ctx.domainDir, "tests/visual/triage-console.snap.json"), "{}\n");

    const result = await visualGate.run(ctx);
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("accepts top-level __snapshots__ artifacts", async () => {
    const ctx = createEvidenceContext();
    mkdirSync(join(ctx.domainDir, "__snapshots__"), { recursive: true });
    writeFileSync(join(ctx.domainDir, "__snapshots__/triage-console.png"), "");

    const result = await visualGate.run(ctx);
    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("fails when composed surface visual evidence is missing", async () => {
    const ctx = createEvidenceContext();
    mkdirSync(join(ctx.domainDir, "tests", "visual"), { recursive: true });

    const result = await visualGate.run(ctx);
    expect(result.status).toBe("fail");
    expect(result.findings).toEqual([
      expect.objectContaining({ code: "VISUAL_SNAPSHOTS_MISSING" }),
    ]);
  });
});

function createEvidenceContext(): GateContext {
  const domainDir = mkdtempSync(join(tmpdir(), "echothink-evidence-"));
  const compiled = compileManifest(parseManifestYaml(fixtureManifest).manifest, {
    now: NOW,
  });
  return {
    domainDir,
    compiled,
    surfaces: compiled.surfaceRegistrations,
    runId: "evidence-test",
    now: NOW,
  };
}
