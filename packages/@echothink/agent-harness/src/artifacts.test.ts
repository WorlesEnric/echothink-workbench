import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { writeRunArtifacts, type RunArtifacts } from "./artifacts.js";

describe("writeRunArtifacts", () => {
  it("creates prompt, patch, command output, and agent-contract artifacts", () => {
    const domainDir = mkdtempSync(join(tmpdir(), "agent-harness-artifacts-"));
    const runId = "run_2026_05_29_001";
    const agentContract: RunArtifacts = {
      runId,
      agent: "surface-agent",
      domainId: "github-triage",
      inputArtifacts: ["domain.manifest.lock.json"],
      outputArtifacts: ["surfaces/composed/triage-console/index.tsx"],
      claims: [
        "No direct network access",
        "Uses only generated SDK hooks",
        "Storybook story generated",
      ],
      validationRequired: ["typescript", "storybook", "permission-simulation"],
    };

    const paths = writeRunArtifacts(domainDir, runId, {
      prompt: "Build the triage console.",
      patch: {
        changedFiles: [
          {
            path: "surfaces/composed/triage-console/index.tsx",
            status: "modified",
            additions: 3,
            deletions: 1,
          },
        ],
        rationale: "Updated the composed surface.",
      },
      commandOutputs: [
        {
          command: "npx vitest run",
          code: 0,
          stdout: "PASS",
          stderr: "",
        },
      ],
      agentContract,
    });

    expect(existsSync(paths.promptPath)).toBe(true);
    expect(existsSync(paths.patchSummaryPath)).toBe(true);
    expect(existsSync(paths.commandOutputsPath)).toBe(true);
    expect(existsSync(paths.agentContractPath)).toBe(true);
    expect(paths.runDir).toBe(join(domainDir, ".workbench", "runs", runId));

    const writtenContract = JSON.parse(
      readFileSync(paths.agentContractPath, "utf8"),
    ) as RunArtifacts;
    expect(writtenContract).toEqual(agentContract);
    expect(Object.keys(writtenContract).sort()).toEqual([
      "agent",
      "claims",
      "domainId",
      "inputArtifacts",
      "outputArtifacts",
      "runId",
      "validationRequired",
    ]);
  });
});
