import { validateManifestSemantics } from "@echothink/domain-manifest";
import type { Gate, GateFinding } from "../types.js";
import {
  gateResult,
} from "./common.js";

export const manifestSemanticGate: Gate = {
  id: "manifest-semantic",
  async run(ctx) {
    const diagnostics = validateManifestSemantics(ctx.compiled.manifest);
    const findings: GateFinding[] = diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: `${diagnostic.path}: ${diagnostic.message}`,
    }));
    return gateResult(this.id, findings);
  },
};
