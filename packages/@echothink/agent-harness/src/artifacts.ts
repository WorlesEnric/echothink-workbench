import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GateId } from "@echothink/validation";

export interface RunArtifacts {
  runId: string;
  agent: string;
  domainId: string;
  inputArtifacts: string[];
  outputArtifacts: string[];
  claims: string[];
  validationRequired: GateId[];
}

export interface PatchSummary {
  changedFiles: Array<{
    path: string;
    status: "added" | "modified" | "deleted";
    additions?: number;
    deletions?: number;
  }>;
  rationale?: string;
}

export interface CommandOutputArtifact {
  command: string;
  code: number;
  stdout: string;
  stderr: string;
  output?: string;
}

export interface WriteRunArtifactsData {
  prompt: string;
  patch: PatchSummary;
  commandOutputs: CommandOutputArtifact[];
  agentContract: RunArtifacts;
}

export interface RunArtifactPaths {
  runDir: string;
  promptPath: string;
  patchSummaryPath: string;
  commandOutputsPath: string;
  agentContractPath: string;
}

export function writeRunArtifacts(
  domainDir: string,
  runId: string,
  data: WriteRunArtifactsData,
): RunArtifactPaths {
  assertSafeRunId(runId);
  if (data.agentContract.runId !== runId) {
    throw new Error("Run artifact contract runId must match the requested runId.");
  }

  const runDir = join(domainDir, ".workbench", "runs", runId);
  mkdirSync(runDir, { recursive: true });

  const promptPath = join(runDir, "prompt.txt");
  const patchSummaryPath = join(runDir, "patch-summary.json");
  const commandOutputsPath = join(runDir, "command-outputs.json");
  const agentContractPath = join(runDir, "agent-contract.json");

  writeFileSync(promptPath, data.prompt, "utf8");
  writeFileSync(patchSummaryPath, `${JSON.stringify(data.patch, null, 2)}\n`, "utf8");
  writeFileSync(
    commandOutputsPath,
    `${JSON.stringify(data.commandOutputs, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    agentContractPath,
    `${JSON.stringify(data.agentContract, null, 2)}\n`,
    "utf8",
  );

  return {
    runDir,
    promptPath,
    patchSummaryPath,
    commandOutputsPath,
    agentContractPath,
  };
}

function assertSafeRunId(runId: string): void {
  if (!/^[A-Za-z0-9._-]+$/u.test(runId)) {
    throw new Error("runId must be a single safe path segment.");
  }
}
