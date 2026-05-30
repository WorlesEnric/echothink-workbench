import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Gate } from "../types.js";
import {
  errorFinding,
  gateResult,
  skipResult,
} from "./common.js";

const A11Y_CONFIG_CANDIDATES = [
  "a11y.config.ts",
  "accessibility.config.ts",
] as const;

export const accessibilityGate: Gate = {
  id: "accessibility",
  async run(ctx) {
    if (ctx.surfaces.length === 0) {
      return skipResult(this.id, "No surfaces are registered.");
    }
    const found = A11Y_CONFIG_CANDIDATES.some((candidate) =>
      existsSync(join(ctx.domainDir, candidate)),
    );
    if (found) {
      return gateResult(this.id, []);
    }
    return gateResult(this.id, [
      errorFinding(
        "ACCESSIBILITY_CONFIG_MISSING",
        `Missing accessibility evidence config. Checked: ${A11Y_CONFIG_CANDIDATES.join(", ")}.`,
      ),
    ]);
  },
};
