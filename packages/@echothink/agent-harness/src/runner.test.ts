import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { defaultDomainPolicy } from "./policy.js";
import { createCodexRunner, type ExecFn } from "./runner.js";

describe("createCodexRunner", () => {
  it("reverts denied writes, keeps allowed writes, and reports blocked actions", async () => {
    const domainDir = mkdtempSync(join(tmpdir(), "agent-harness-runner-"));
    writeFileSync(join(domainDir, "domain.manifest.yaml"), "metadata: {}\n");

    const fakeExec: ExecFn = async (_cmd, _args, opts) => {
      mkdirSync(join(opts.cwd, "surfaces/composed/x"), { recursive: true });
      mkdirSync(join(opts.cwd, "kernel"), { recursive: true });
      writeFileSync(
        join(opts.cwd, "surfaces/composed/x/index.tsx"),
        "export const X = () => null;\n",
        { flag: "w" },
      );
      writeFileSync(
        join(opts.cwd, "kernel/generated-types.ts"),
        "export type Generated = string;\n",
        { flag: "w" },
      );
      return { code: 0, stdout: "done", stderr: "" };
    };

    const runner = createCodexRunner({ exec: fakeExec });
    const result = await runner.run({
      prompt: "Create a composed surface.",
      cwd: domainDir,
      policy: defaultDomainPolicy(domainDir),
      runId: "run-1",
    });

    expect(result.ok).toBe(false);
    expect(result.blockedActions).toContain(
      "write outside allowed scope: kernel/generated-types.ts",
    );
    expect(result.patch.changedFiles.map((file) => file.path)).toContain(
      "surfaces/composed/x/index.tsx",
    );
    expect(result.patch.changedFiles.map((file) => file.path)).toContain(
      "kernel/generated-types.ts",
    );
    expect(readFileSync(join(domainDir, "surfaces/composed/x/index.tsx"), "utf8"))
      .toContain("export const X");
    expect(() =>
      readFileSync(join(domainDir, "kernel/generated-types.ts"), "utf8"),
    ).toThrow();
  });
});
