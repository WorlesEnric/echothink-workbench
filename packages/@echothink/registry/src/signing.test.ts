import { describe, expect, it } from "vitest";
import type { ReleaseManifest } from "./release-manifest.js";
import {
  createHmacSigner,
  createHmacVerifier,
  releaseManifestSigningPayload,
  signReleaseManifest,
  verifyReleaseSignature,
} from "./signing.js";

describe("release manifest signing", () => {
  it("signs and verifies an HMAC release manifest", () => {
    const release = releaseFixture();
    const signer = createHmacSigner("test-secret", "test-key");
    const verifier = createHmacVerifier("test-secret");

    const signed = signReleaseManifest(release, signer);

    expect(signed.signature).toMatch(/^HMAC-SHA256:test-key:[a-f0-9]{64}$/);
    expect(verifyReleaseSignature(signed, verifier)).toBe(true);
  });

  it("fails verification when the signed body is tampered", () => {
    const signer = createHmacSigner("test-secret", "test-key");
    const verifier = createHmacVerifier("test-secret");
    const signed = signReleaseManifest(releaseFixture(), signer);

    const tampered: ReleaseManifest = {
      ...signed,
      validationReport: "validation/tampered.json",
    };

    expect(verifyReleaseSignature(tampered, verifier)).toBe(false);
  });

  it("excludes the signature field from the signed payload", () => {
    const signer = createHmacSigner("test-secret", "test-key");
    const signed = signReleaseManifest(releaseFixture(), signer);
    const signature = signed.signature;

    const payloadBefore = releaseManifestSigningPayload(signed);
    signed.signature = "HMAC-SHA256:test-key:0000000000000000000000000000000000000000000000000000000000000000";
    const payloadAfter = releaseManifestSigningPayload(signed);
    const resigned = signReleaseManifest(signed, signer);

    expect(payloadAfter).toBe(payloadBefore);
    expect(resigned.signature).toBe(signature);
  });
});

function releaseFixture(): ReleaseManifest {
  return {
    domainId: "github-triage",
    version: "0.4.0",
    gitCommit: "abc123",
    manifestDigest:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    surfaceDigests: {
      "issues-admin":
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    sdkContractVersion: "1.2",
    runtimeCompatibility: ">=2.3 <3.0",
    validationReport: "validation/run_2026_05_29_001.json",
    approvals: [],
  };
}
