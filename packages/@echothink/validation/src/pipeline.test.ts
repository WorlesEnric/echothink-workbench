import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileManifest,
  generateKernel,
  parseManifestYaml,
} from "@echothink/domain-manifest";
import { GATE_IDS } from "./gate-matrix.js";
import { runPipeline } from "./pipeline.js";
import { writeReport } from "./report.js";

const NOW = "2026-05-29T12:00:00.000Z";
const fixtureDomainDir = new URL("../../../../domains/github-triage", import.meta.url);

describe("runPipeline", () => {
  it("runs the full validation pipeline on a prepared github-triage domain copy", async () => {
    const domainDir = prepareDomainCopy();
    const manifestYaml = readFileSync(join(domainDir, "domain.manifest.yaml"), "utf8");
    const compiled = compileManifest(parseManifestYaml(manifestYaml).manifest, {
      now: NOW,
    });

    const report = await runPipeline({
      domainDir,
      compiled,
      surfaces: compiled.surfaceRegistrations,
      runId: "pipeline-test",
      now: NOW,
    });

    expect(report).toMatchObject({
      runId: "pipeline-test",
      domainId: "github-triage",
      version: "0.4.0",
      createdAt: NOW,
      overall: "pass",
      surfaceTypeProfile: {
        "issues-admin": "standard",
        "triage-console": "composed",
      },
    });
    expect(report.gates.map((gate) => gate.gate)).toEqual([...GATE_IDS]);
    expect(
      report.gates.every((gate) => typeof gate.durationMs === "number"),
    ).toBe(true);

    const outPath = join(domainDir, "validation-report.json");
    writeReport(report, outPath);
    const reread = JSON.parse(readFileSync(outPath, "utf8")) as unknown;
    expect(reread).toMatchObject({
      runId: "pipeline-test",
      overall: "pass",
      gates: expect.any(Array),
    });
  });
});

function prepareDomainCopy(): string {
  const domainDir = mkdtempSync(join(tmpdir(), "echothink-pipeline-"));
  cpSync(fixtureDomainDir, domainDir, { recursive: true });
  const manifestYaml = readFileSync(join(domainDir, "domain.manifest.yaml"), "utf8");
  const compiled = compileManifest(parseManifestYaml(manifestYaml).manifest, {
    now: NOW,
  });
  for (const file of generateKernel(compiled)) {
    const path = join(domainDir, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.contents, "utf8");
  }

  const surfaceDir = join(domainDir, "surfaces/composed/triage-console");
  mkdirSync(surfaceDir, { recursive: true });
  rmSync(join(surfaceDir, "tests.spec.tsx"), { force: true });
  writeFileSync(
    join(surfaceDir, "index.tsx"),
    "export const TriageConsole = () => null;\n",
    "utf8",
  );
  writeFileSync(
    join(surfaceDir, "stories.tsx"),
    "export const Basic = {};\n",
    "utf8",
  );
  mkdirSync(join(domainDir, "fixtures"), { recursive: true });
  writeFileSync(
    join(domainDir, "fixtures/effect-stubs.yaml"),
    "- id: github.issue.comment\n",
    "utf8",
  );
  writeFileSync(
    join(domainDir, "a11y.config.ts"),
    "export const a11y = { enabled: true };\n",
    "utf8",
  );
  mkdirSync(join(domainDir, "tests", "visual"), { recursive: true });
  writeFileSync(
    join(domainDir, "tests/visual/triage-console.snap.json"),
    "{}\n",
    "utf8",
  );
  return domainDir;
}
