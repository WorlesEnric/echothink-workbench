import { GATE_IDS, GATE_MATRIX } from "./gate-matrix.js";
import { allGates, gatesById } from "./gates/index.js";
import {
  exceptionResult,
  hasError,
  surfaceTypes,
} from "./gates/common.js";
import type {
  Gate,
  GateContext,
  GateId,
  GateResult,
  ValidationReport,
} from "./types.js";

const ALWAYS_REQUIRED: readonly GateId[] = [
  "manifest-schema",
  "manifest-semantic",
  "permission-simulation",
  "entity-contract",
  "process-contract",
];

export async function runPipeline(
  ctx: GateContext,
  gates?: GateId[],
): Promise<ValidationReport> {
  const selectedGates = gates ? resolveRequestedGates(gates) : defaultGates(ctx);
  const results: GateResult[] = [];

  for (const gate of selectedGates) {
    results.push(await runGate(ctx, gate));
  }

  return {
    runId: ctx.runId,
    domainId: ctx.compiled.manifest.metadata.id,
    version: ctx.compiled.manifest.metadata.version,
    createdAt: ctx.now,
    surfaceTypeProfile: Object.fromEntries(
      ctx.surfaces.map((surface) => [surface.id, surface.type]),
    ),
    gates: results,
    overall: results.some((result) => hasError(result.findings)) ? "fail" : "pass",
  };
}

function defaultGates(ctx: GateContext): Gate[] {
  const presentTypes = surfaceTypes(ctx.surfaces);
  const selected = new Set<GateId>(ALWAYS_REQUIRED);
  for (const gate of GATE_IDS) {
    if (
      presentTypes.some(
        (surfaceType) => GATE_MATRIX[surfaceType][gate] !== "skip",
      )
    ) {
      selected.add(gate);
    }
  }
  return allGates.filter((gate) => selected.has(gate.id));
}

function resolveRequestedGates(gates: readonly GateId[]): Gate[] {
  return gates.map((gateId) => {
    const gate = gatesById.get(gateId);
    if (!gate) {
      throw new Error(`Unknown validation gate "${gateId}".`);
    }
    return gate;
  });
}

async function runGate(ctx: GateContext, gate: Gate): Promise<GateResult> {
  const start = process.hrtime.bigint();
  try {
    const result = await gate.run(ctx);
    return withDuration(result, start);
  } catch (error) {
    return withDuration(exceptionResult(gate.id, error), start);
  }
}

function withDuration(result: GateResult, start: bigint): GateResult {
  const end = process.hrtime.bigint();
  return {
    ...result,
    durationMs: Number(end - start) / 1_000_000,
  };
}
