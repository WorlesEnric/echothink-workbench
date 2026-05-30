import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Gate, GateFinding } from "../types.js";
import {
  errorFinding,
  gateResult,
  readUtf8,
  skipResult,
} from "./common.js";

export const effectSimulationGate: Gate = {
  id: "effect-simulation",
  async run(ctx) {
    const usedEffectIds = [
      ...new Set(
        ctx.compiled.normalizedProcesses.flatMap((process) => process.effects),
      ),
    ].sort();
    if (usedEffectIds.length === 0) {
      return skipResult(this.id, "No unit processes declare external effects.", "EFFECTS_NOT_APPLICABLE");
    }

    const findings: GateFinding[] = [];
    const stubsPath = join(ctx.domainDir, "fixtures", "effect-stubs.yaml");
    const stubIds = existsSync(stubsPath)
      ? parseEffectStubIds(readUtf8(stubsPath))
      : new Set<string>();
    if (!existsSync(stubsPath)) {
      findings.push(
        errorFinding(
          "EFFECT_STUBS_MISSING",
          "fixtures/effect-stubs.yaml is required because at least one process declares effects.",
          { file: "fixtures/effect-stubs.yaml" },
        ),
      );
    }

    for (const effectId of usedEffectIds) {
      const effect = ctx.compiled.manifest.effects[effectId];
      if (!effect) {
        findings.push(
          errorFinding(
            "EFFECT_NOT_DECLARED",
            `Effect "${effectId}" is used by a process but is not declared in the manifest.`,
          ),
        );
        continue;
      }
      if (!stubIds.has(effectId)) {
        findings.push(
          errorFinding(
            "EFFECT_STUB_MISSING",
            `Effect "${effectId}" has no preview stub in fixtures/effect-stubs.yaml.`,
            { file: "fixtures/effect-stubs.yaml" },
          ),
        );
      }
      if (!effect.secretRef) {
        findings.push(
          errorFinding(
            "EFFECT_SECRET_REF_MISSING",
            `Effect "${effectId}" must declare secretRef.`,
          ),
        );
      }
      if (!effect.egress?.allowHosts || effect.egress.allowHosts.length === 0) {
        findings.push(
          errorFinding(
            "EFFECT_EGRESS_MISSING",
            `Effect "${effectId}" must declare egress.allowHosts.`,
          ),
        );
      }
    }

    return gateResult(this.id, findings);
  },
};

function parseEffectStubIds(contents: string): Set<string> {
  const ids = new Set<string>();
  try {
    collectIds(JSON.parse(contents) as unknown, ids);
    return ids;
  } catch {
    // Fall through to the small YAML subset used by fixtures.
  }

  for (const line of contents.split(/\r?\n/)) {
    const listMatch = /^\s*-\s*id:\s*["']?([^"'\s#]+)["']?/.exec(line);
    if (listMatch?.[1]) {
      ids.add(listMatch[1]);
      continue;
    }
    const keyMatch = /^\s*([A-Za-z0-9_.-]+):\s*(?:#.*)?$/.exec(line);
    if (keyMatch?.[1]?.includes(".")) {
      ids.add(keyMatch[1]);
    }
  }
  return ids;
}

function collectIds(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectIds(item, ids);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string") {
    ids.add(record.id);
  }
  for (const [key, child] of Object.entries(record)) {
    if (key.includes(".")) {
      ids.add(key);
    }
    collectIds(child, ids);
  }
}
