#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  compileManifest,
  parseManifestYaml,
} from "@echothink/domain-manifest";
import { runPipeline } from "./pipeline.js";
import { summarize, writeReport } from "./report.js";
import type { GateId } from "./types.js";
import { GATE_IDS } from "./gate-matrix.js";

interface CliArgs {
  domainDir: string;
  gates?: GateId[];
  json?: string;
  now: string;
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const manifestYaml = readFileSync(
    join(args.domainDir, "domain.manifest.yaml"),
    "utf8",
  );
  const { manifest } = parseManifestYaml(manifestYaml);
  const compiled = compileManifest(manifest, { now: args.now });
  const report = await runPipeline(
    {
      domainDir: args.domainDir,
      compiled,
      surfaces: compiled.surfaceRegistrations,
      runId: `validation-${args.now.replace(/[^0-9A-Za-z]/g, "")}`,
      now: args.now,
    },
    args.gates,
  );
  if (args.json) {
    writeReport(report, args.json);
  }
  console.log(summarize(report));
  process.exit(report.overall === "fail" ? 1 : 0);
}

function parseArgs(argv: readonly string[]): CliArgs {
  const [domainDirArg, ...rest] = argv;
  if (!domainDirArg || domainDirArg === "-h" || domainDirArg === "--help") {
    throw new Error(
      "Usage: echothink-validate <domainDir> [--gates a,b,c] [--json <out>] [--now <iso>]",
    );
  }
  let gates: GateId[] | undefined;
  let json: string | undefined;
  let now: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--gates") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--gates requires a comma-separated value.");
      }
      gates = parseGates(value);
      index += 1;
      continue;
    }
    if (arg === "--json") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--json requires an output path.");
      }
      json = resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--now") {
      const value = rest[index + 1];
      if (!value) {
        throw new Error("--now requires an ISO timestamp.");
      }
      now = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument "${arg}".`);
  }

  return {
    domainDir: resolve(domainDirArg),
    ...(gates ? { gates } : {}),
    ...(json ? { json } : {}),
    now: now ?? new Date().toISOString(),
  };
}

function parseGates(value: string): GateId[] {
  const allowed = new Set<string>(GATE_IDS);
  return value.split(",").map((gate) => {
    const trimmed = gate.trim();
    if (!allowed.has(trimmed)) {
      throw new Error(`Unknown validation gate "${trimmed}".`);
    }
    return trimmed as GateId;
  });
}

void main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
