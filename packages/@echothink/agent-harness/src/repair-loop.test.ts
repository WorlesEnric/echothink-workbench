import { describe, expect, it } from "vitest";
import type { ValidationReport } from "@echothink/validation";

import { defaultDomainPolicy } from "./policy.js";
import { runRepairLoop } from "./repair-loop.js";
import type { CodexRunner, CodexTask } from "./runner.js";

describe("runRepairLoop", () => {
  const task: CodexTask = {
    prompt: "Fix the surface.",
    cwd: "/tmp/domain",
    policy: defaultDomainPolicy("/tmp/domain"),
    runId: "run-1",
  };

  it("stops once validation passes", async () => {
    const runner = countingRunner();
    let validations = 0;
    const result = await runRepairLoop({
      runner,
      task,
      maxIterations: 3,
      validate: async () => {
        validations += 1;
        return validations === 1 ? failReport() : passReport();
      },
    });

    expect(result.iterations).toBe(2);
    expect(result.report.overall).toBe("pass");
    expect(result.history).toEqual([
      { iteration: 1, ok: false, failingGates: ["typescript"] },
      { iteration: 2, ok: true, failingGates: [] },
    ]);
    expect(runner.runs).toBe(2);
  });

  it("stops at maxIterations when validation never passes", async () => {
    const runner = countingRunner();
    const result = await runRepairLoop({
      runner,
      task,
      maxIterations: 2,
      validate: async () => failReport(),
    });

    expect(result.iterations).toBe(2);
    expect(result.report.overall).toBe("fail");
    expect(result.history.map((entry) => entry.failingGates)).toEqual([
      ["typescript"],
      ["typescript"],
    ]);
    expect(runner.runs).toBe(2);
  });
});

function countingRunner(): CodexRunner & { runs: number } {
  return {
    runs: 0,
    async run() {
      this.runs += 1;
      return {
        ok: true,
        patch: { changedFiles: [] },
        logsPath: "/tmp/logs.json",
        commandsRun: [],
        blockedActions: [],
      };
    },
  };
}

function passReport(): ValidationReport {
  return {
    runId: "validation-2",
    domainId: "github-triage",
    version: "0.1.0",
    createdAt: "2026-05-29T12:00:00.000Z",
    surfaceTypeProfile: {},
    gates: [
      {
        gate: "typescript",
        status: "pass",
        findings: [],
        durationMs: 1,
      },
    ],
    overall: "pass",
  };
}

function failReport(): ValidationReport {
  return {
    runId: "validation-1",
    domainId: "github-triage",
    version: "0.1.0",
    createdAt: "2026-05-29T12:00:00.000Z",
    surfaceTypeProfile: {},
    gates: [
      {
        gate: "typescript",
        status: "fail",
        findings: [
          {
            severity: "error",
            message: "Cannot find name X.",
            file: "surfaces/composed/x/index.tsx",
            line: 1,
            code: "TS2304",
          },
        ],
        durationMs: 1,
      },
    ],
    overall: "fail",
  };
}
