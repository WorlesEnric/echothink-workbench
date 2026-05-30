import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Gate, GateFinding } from "../types.js";
import {
  errorFinding,
  gateResult,
  surfaceDirectory,
} from "./common.js";

export const storybookGate: Gate = {
  id: "storybook",
  async run(ctx) {
    const findings: GateFinding[] = [];
    for (const surface of ctx.surfaces) {
      if (surface.type === "standard") {
        continue;
      }
      const storiesPath = join(surfaceDirectory(ctx.domainDir, surface), "stories.tsx");
      if (!existsSync(storiesPath)) {
        findings.push(
          errorFinding(
            "STORYBOOK_STORY_MISSING",
            `Surface "${surface.id}" requires a stories.tsx artifact for Storybook evidence.`,
            { file: storiesPath },
          ),
        );
      }
    }
    return gateResult(this.id, findings);
  },
};
