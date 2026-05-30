import { join } from "node:path";
import {
  ManifestParseError,
  parseManifestYaml,
} from "@echothink/domain-manifest";
import type { Gate } from "../types.js";
import {
  errorFinding,
  gateResult,
  readUtf8,
} from "./common.js";

export const manifestSchemaGate: Gate = {
  id: "manifest-schema",
  async run(ctx) {
    const manifestPath = join(ctx.domainDir, "domain.manifest.yaml");
    try {
      parseManifestYaml(readUtf8(manifestPath));
      return gateResult(this.id, []);
    } catch (error) {
      if (error instanceof ManifestParseError) {
        return gateResult(
          this.id,
          error.issues.map((issue) =>
            errorFinding(
              "MANIFEST_SCHEMA",
              issue.message,
              {
                file: manifestPath,
                line:
                  issue.path.length > 0
                    ? undefined
                    : undefined,
              },
            ),
          ),
        );
      }
      return gateResult(
        this.id,
        [
          errorFinding(
            "MANIFEST_SCHEMA",
            error instanceof Error ? error.message : String(error),
            { file: manifestPath },
          ),
        ],
      );
    }
  },
};
