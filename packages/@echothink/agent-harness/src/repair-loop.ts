import type { GateId, ValidationReport } from "@echothink/validation";

import type { CodexRunner, CodexTask } from "./runner.js";

export interface RepairLoopHistoryEntry {
  iteration: number;
  ok: boolean;
  failingGates: GateId[];
}

export interface RepairLoopResult {
  report: ValidationReport;
  iterations: number;
  history: RepairLoopHistoryEntry[];
}

export interface RepairLoopOptions {
  runner: CodexRunner;
  validate: () => Promise<ValidationReport>;
  task: CodexTask;
  maxIterations: number;
  composeRepairPrompt?: (
    report: ValidationReport,
    prevTask: CodexTask,
  ) => string;
}

export async function runRepairLoop(
  opts: RepairLoopOptions,
): Promise<RepairLoopResult> {
  if (opts.maxIterations < 1) {
    throw new Error("runRepairLoop requires maxIterations >= 1.");
  }

  const history: RepairLoopHistoryEntry[] = [];
  let currentTask = opts.task;
  let finalReport: ValidationReport | undefined;

  for (let iteration = 1; iteration <= opts.maxIterations; iteration += 1) {
    const runResult = await opts.runner.run(currentTask);
    finalReport = await opts.validate();
    const failingGates = failingGateIds(finalReport);
    history.push({
      iteration,
      ok: runResult.ok && finalReport.overall === "pass",
      failingGates,
    });

    if (finalReport.overall === "pass") {
      return {
        report: finalReport,
        iterations: iteration,
        history,
      };
    }

    if (iteration < opts.maxIterations) {
      const composeRepairPrompt =
        opts.composeRepairPrompt ?? defaultComposeRepairPrompt;
      currentTask = {
        ...currentTask,
        prompt: composeRepairPrompt(finalReport, currentTask),
      };
    }
  }

  if (!finalReport) {
    throw new Error("runRepairLoop completed without a validation report.");
  }

  return {
    report: finalReport,
    iterations: opts.maxIterations,
    history,
  };
}

export function defaultComposeRepairPrompt(
  report: ValidationReport,
  prevTask: CodexTask,
): string {
  const lines = [
    "Repair the previous Codex patch for the Echothink App Domain.",
    "Fix ONLY within the harness file-scope policy. Do not edit generated kernel, validation artifacts, release manifests, platform packages, or dependencies.",
    "Validation failed with these gates:",
  ];

  for (const gate of report.gates) {
    const errors = gate.findings.filter(
      (finding) => finding.severity === "error",
    );
    if (errors.length === 0) continue;
    lines.push(`- ${gate.gate}`);
    for (const finding of errors) {
      const location = finding.file
        ? ` (${finding.file}${finding.line ? `:${String(finding.line)}` : ""})`
        : "";
      lines.push(`  - ${finding.code}: ${finding.message}${location}`);
    }
  }

  lines.push("Original task:");
  lines.push(prevTask.prompt);
  return lines.join("\n");
}

function failingGateIds(report: ValidationReport): GateId[] {
  return report.gates
    .filter((gate) =>
      gate.findings.some((finding) => finding.severity === "error"),
    )
    .map((gate) => gate.gate);
}
