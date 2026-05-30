import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Gate } from "../types.js";
import {
  errorFinding,
  gateResult,
  listFilesRecursive,
  skipResult,
} from "./common.js";

const SNAPSHOT_DIR_CANDIDATES = [
  "tests/visual",
  "__snapshots__",
] as const;

export const visualGate: Gate = {
  id: "visual",
  async run(ctx) {
    if (ctx.surfaces.length === 0) {
      return skipResult(this.id, "No surfaces are registered.");
    }
    const found = SNAPSHOT_DIR_CANDIDATES.some((candidate) => {
      const path = join(ctx.domainDir, candidate);
      return (
        existsSync(path) &&
        statSync(path).isDirectory() &&
        listFilesRecursive(path, isVisualSnapshotFile).length > 0
      );
    });
    if (found) {
      return gateResult(this.id, []);
    }
    return gateResult(this.id, [
      errorFinding(
        "VISUAL_SNAPSHOTS_MISSING",
        `Missing visual snapshot directory. Checked: ${SNAPSHOT_DIR_CANDIDATES.join(", ")}.`,
      ),
    ]);
  },
};

function isVisualSnapshotFile(path: string): boolean {
  return (
    path.endsWith(".snap") ||
    path.endsWith(".snapshot") ||
    path.endsWith(".png") ||
    path.endsWith(".snap.json")
  );
}
