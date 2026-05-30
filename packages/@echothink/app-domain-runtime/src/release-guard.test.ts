import { describe, expect, it } from "vitest";

import type { ReleaseManifestLike } from "./release-guard.js";
import {
  compileGithubTriage,
  createRuntimeHarness,
  sdkRequest,
} from "./test-support.js";

describe("ReleaseGuard", () => {
  it("rejects SDK requests with mismatched surface digest", async () => {
    const compiled = compileGithubTriage();
    const release: ReleaseManifestLike = {
      manifestVersion: compiled.manifest.metadata.version,
      manifestDigest: compiled.manifestDigest,
      sdkContractVersion: compiled.manifest.metadata.sdkContractVersion,
      surfaceDigests: {
        "triage-console": "sha256:expected",
      },
      promotionState: "approved",
    };
    const { runtime } = createRuntimeHarness({ role: "admin", compiled, release });
    const req = sdkRequest("identity.current");
    req.surfaceDigest = "sha256:actual";

    const response = await runtime.call(req);

    expect(response).toMatchObject({
      ok: false,
      error: { kind: "release_guard" },
    });
  });
});
