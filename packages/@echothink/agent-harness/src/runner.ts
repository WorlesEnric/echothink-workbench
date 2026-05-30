import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  promises as fs,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  canonicalJSONStringify,
  sha256OfBytes,
  type Sha256,
} from "@echothink/shared-types";

import {
  type CommandOutputArtifact,
  type PatchSummary,
  writeRunArtifacts,
} from "./artifacts.js";
import {
  assertPatchWithinScope,
  type HarnessPolicy,
  normalizeRelativePath,
} from "./policy.js";

export interface CodexTask {
  prompt: string;
  cwd: string;
  policy: HarnessPolicy;
  runId: string;
}

export interface CodexRunResult {
  ok: boolean;
  patch: PatchSummary;
  logsPath: string;
  commandsRun: string[];
  blockedActions: string[];
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd: string;
  input?: string;
  env?: NodeJS.ProcessEnv;
}

export type ExecFn = (
  cmd: string,
  args: string[],
  opts: ExecOptions,
) => Promise<ExecResult>;

export interface CreateCodexRunnerOptions {
  exec?: ExecFn;
  codexBin?: string;
  revertBlockedChanges?: boolean;
}

interface FileSnapshot {
  hash: Sha256;
  content: Buffer;
}

interface DiffEntry {
  path: string;
  status: "added" | "modified" | "deleted";
  additions?: number;
  deletions?: number;
}

type Snapshot = Map<string, FileSnapshot>;

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export function createCodexRunner(
  opts: CreateCodexRunnerOptions = {},
): CodexRunner {
  const exec = opts.exec ?? defaultExec;
  const codexBin = opts.codexBin ?? "codex";
  const revertBlockedChanges = opts.revertBlockedChanges ?? true;

  return {
    async run(task: CodexTask): Promise<CodexRunResult> {
      assertSafeRunId(task.runId);
      const cwd = resolve(task.cwd);
      const before = await snapshotTree(cwd);
      const tempDir = await fs.mkdtemp(join(tmpdir(), "echothink-codex-"));
      const codexOutputPath = join(tempDir, "codex-output.txt");
      const args = [
        "exec",
        "--full-auto",
        "--skip-git-repo-check",
        "-o",
        codexOutputPath,
        "-",
      ];
      const governedPrompt = composeGovernedPrompt(task);
      const command = renderCommand(codexBin, args);
      const commandOutput = await exec(codexBin, args, {
        cwd,
        input: governedPrompt,
        env: safeEnv(task.policy),
      });

      let codexOutput: string | undefined;
      if (existsSync(codexOutputPath)) {
        codexOutput = readFileSync(codexOutputPath, "utf8");
      }
      rmSync(tempDir, { force: true, recursive: true });

      const after = await snapshotTree(cwd);
      const changedFiles = diffSnapshots(before, after);
      const patch: PatchSummary = {
        changedFiles,
        ...(codexOutput ? { rationale: codexOutput.trim() } : {}),
      };
      const blockedActions: string[] = [];
      const blockedPaths = new Set<string>();

      const scopeResult = assertPatchWithinScope(
        task.policy,
        changedFiles.map((file) => file.path),
      );
      for (const violation of scopeResult.violations) {
        blockedActions.push(`write outside allowed scope: ${violation}`);
        const normalized = normalizeRelativePath(violation);
        if (normalized) blockedPaths.add(normalized);
      }

      if (!task.policy.allowNewDependencies) {
        for (const packagePath of changedPackageJsonDependencyPaths(
          before,
          after,
          changedFiles,
        )) {
          blockedActions.push(`dependency changes are not allowed: ${packagePath}`);
          blockedPaths.add(packagePath);
        }
      }

      if (revertBlockedChanges) {
        for (const blockedPath of blockedPaths) {
          await restorePath(cwd, blockedPath, before.get(blockedPath));
        }
      }

      const commandOutputs: CommandOutputArtifact[] = [
        {
          command,
          code: commandOutput.code,
          stdout: commandOutput.stdout,
          stderr: commandOutput.stderr,
          ...(codexOutput ? { output: codexOutput } : {}),
        },
      ];
      const artifactPaths = writeRunArtifacts(cwd, task.runId, {
        prompt: task.prompt,
        patch,
        commandOutputs,
        agentContract: {
          runId: task.runId,
          agent: "codex",
          domainId: basename(cwd),
          inputArtifacts: [],
          outputArtifacts: changedFiles.map((file) => file.path),
          claims: [
            "Network disabled by harness policy",
            "Secrets stripped from Codex process environment",
            "Patch checked against file-scope policy",
          ],
          validationRequired: [],
        },
      });

      return {
        ok: commandOutput.code === 0 && blockedActions.length === 0,
        patch,
        logsPath: artifactPaths.commandOutputsPath,
        commandsRun: [command],
        blockedActions,
      };
    },
  };
}

export interface CodexRunner {
  run(task: CodexTask): Promise<CodexRunResult>;
}

export const defaultExec: ExecFn = async (
  cmd: string,
  args: string[],
  opts: ExecOptions,
): Promise<ExecResult> =>
  new Promise((resolveExec) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      resolveExec({
        code: 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${Buffer.concat(stderr).toString("utf8")}${error.message}`,
      });
    });
    child.on("close", (code) => {
      resolveExec({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });

    child.stdin.end(opts.input ?? "", "utf8");
  });

function composeGovernedPrompt(task: CodexTask): string {
  return [
    "You are running inside the Echothink controlled Codex harness.",
    "You may only write files matching these allow globs:",
    ...task.policy.fileScope.allowWriteGlobs.map((glob) => `- ${glob}`),
    "You must not write files matching these deny or platform-owned globs:",
    ...[
      ...task.policy.fileScope.denyWriteGlobs,
      ...task.policy.fileScope.platformOwnedGlobs,
    ].map((glob) => `- ${glob}`),
    "You may only run commands from this allowlist:",
    ...task.policy.commands.allow.map((cmd) => `- ${cmd}`),
    `Network policy: ${task.policy.network}.`,
    `New dependencies allowed: ${String(task.policy.allowNewDependencies)}.`,
    "User task:",
    task.prompt,
  ].join("\n");
}

function safeEnv(policy: HarnessPolicy): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || isSensitiveEnvKey(key)) continue;
    env[key] = value;
  }

  if (policy.network === "disabled") {
    env.HTTP_PROXY = "";
    env.HTTPS_PROXY = "";
    env.ALL_PROXY = "";
    env.NO_PROXY = "*";
    env.npm_config_offline = "true";
  }
  env.ECHOTHINK_NETWORK_POLICY = policy.network;
  return env;
}

function isSensitiveEnvKey(key: string): boolean {
  return /(?:SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION|PRIVATE|API_KEY|OPENAI|ANTHROPIC|GITHUB|NPM_TOKEN|AWS_|AZURE_|GOOGLE_|SUPABASE)/iu.test(
    key,
  );
}

async function snapshotTree(root: string): Promise<Snapshot> {
  const snapshot: Snapshot = new Map();
  await walk(root, "", snapshot);
  return snapshot;
}

async function walk(root: string, relDir: string, snapshot: Snapshot): Promise<void> {
  const absDir = join(root, relDir);
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;

    const relPath = normalizeRelativePath(join(relDir, entry.name));
    if (!relPath) continue;
    const absPath = join(root, relPath);
    if (entry.isDirectory()) {
      await walk(root, relPath, snapshot);
    } else if (entry.isFile()) {
      const content = await fs.readFile(absPath);
      snapshot.set(relPath, {
        hash: sha256OfBytes(content),
        content,
      });
    }
  }
}

function diffSnapshots(before: Snapshot, after: Snapshot): DiffEntry[] {
  const paths = new Set([...before.keys(), ...after.keys()]);
  const changed: DiffEntry[] = [];

  for (const path of [...paths].sort()) {
    const beforeFile = before.get(path);
    const afterFile = after.get(path);
    if (!beforeFile && afterFile) {
      changed.push({
        path,
        status: "added",
        additions: lineCount(afterFile.content),
      });
    } else if (beforeFile && !afterFile) {
      changed.push({
        path,
        status: "deleted",
        deletions: lineCount(beforeFile.content),
      });
    } else if (beforeFile && afterFile && beforeFile.hash !== afterFile.hash) {
      changed.push({
        path,
        status: "modified",
        ...changedLineCounts(beforeFile.content, afterFile.content),
      });
    }
  }

  return changed;
}

function changedLineCounts(
  beforeContent: Buffer,
  afterContent: Buffer,
): { additions: number; deletions: number } {
  const beforeLines = lines(beforeContent);
  const afterLines = lines(afterContent);
  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] ===
      afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    additions: afterLines.length - prefix - suffix,
    deletions: beforeLines.length - prefix - suffix,
  };
}

function lineCount(content: Buffer): number {
  return lines(content).length;
}

function lines(content: Buffer): string[] {
  const text = content.toString("utf8");
  if (text.length === 0) return [];
  return text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
}

function changedPackageJsonDependencyPaths(
  before: Snapshot,
  after: Snapshot,
  changedFiles: readonly DiffEntry[],
): string[] {
  const changedPackagePaths = changedFiles
    .map((file) => file.path)
    .filter((filePath) => basename(filePath) === "package.json");

  return changedPackagePaths.filter((packagePath) =>
    packageDependenciesChanged(before.get(packagePath), after.get(packagePath)),
  );
}

function packageDependenciesChanged(
  beforeFile: FileSnapshot | undefined,
  afterFile: FileSnapshot | undefined,
): boolean {
  const beforeJson = parseJsonObject(beforeFile?.content);
  const afterJson = parseJsonObject(afterFile?.content);
  return DEPENDENCY_SECTIONS.some(
    (section) =>
      canonicalJSONStringify(beforeJson[section] ?? {}) !==
      canonicalJSONStringify(afterJson[section] ?? {}),
  );
}

function parseJsonObject(content: Buffer | undefined): Record<string, unknown> {
  if (!content) return {};
  try {
    const parsed = JSON.parse(content.toString("utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

async function restorePath(
  root: string,
  relPath: string,
  snapshot: FileSnapshot | undefined,
): Promise<void> {
  const absPath = join(root, relPath);
  if (!snapshot) {
    await fs.rm(absPath, { force: true, recursive: true });
    await pruneEmptyDirs(root, dirname(absPath));
    return;
  }

  mkdirSync(dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, snapshot.content);
}

async function pruneEmptyDirs(root: string, startDir: string): Promise<void> {
  let current = resolve(startDir);
  const resolvedRoot = resolve(root);
  while (current.startsWith(resolvedRoot) && current !== resolvedRoot) {
    const entries = await fs.readdir(current);
    if (entries.length > 0) return;
    await fs.rmdir(current);
    current = dirname(current);
  }
}

function renderCommand(cmd: string, args: readonly string[]): string {
  return [cmd, ...args].map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/u.test(value)) return value;
  return `'${value.replace(/'/gu, "'\\''")}'`;
}

function assertSafeRunId(runId: string): void {
  if (!/^[A-Za-z0-9._-]+$/u.test(runId)) {
    throw new Error("runId must be a single safe path segment.");
  }
}
