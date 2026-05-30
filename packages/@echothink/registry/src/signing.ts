import { createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJSONStringify } from "@echothink/shared-types";
import type { ReleaseManifest } from "./release-manifest.js";
import { unsignedReleaseManifest } from "./release-manifest.js";

export interface Signer {
  sign(payload: string): string;
  algorithm: string;
  keyId: string;
}

export interface Verifier {
  verify(payload: string, signature: string): boolean;
}

const HMAC_SHA256_ALGORITHM = "HMAC-SHA256";

export function createHmacSigner(secret: string, keyId: string): Signer {
  return {
    algorithm: HMAC_SHA256_ALGORITHM,
    keyId,
    sign(payload: string): string {
      const hex = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
      return `${HMAC_SHA256_ALGORITHM}:${keyId}:${hex}`;
    },
  };
}

export function createHmacVerifier(secret: string): Verifier {
  return {
    verify(payload: string, signature: string): boolean {
      const parts = signature.split(":");
      if (parts.length !== 3 || parts[0] !== HMAC_SHA256_ALGORITHM) {
        return false;
      }

      const [, keyId] = parts;
      if (!keyId) {
        return false;
      }

      const expected = createHmacSigner(secret, keyId).sign(payload);
      return timingSafeStringEqual(signature, expected);
    },
  };
}

export function releaseManifestSigningPayload(release: ReleaseManifest): string {
  return canonicalJSONStringify(unsignedReleaseManifest(release));
}

export function signReleaseManifest(
  release: ReleaseManifest,
  signer: Signer,
): ReleaseManifest {
  release.signature = signer.sign(releaseManifestSigningPayload(release));
  return release;
}

export function verifyReleaseSignature(
  release: ReleaseManifest,
  verifier: Verifier,
): boolean {
  if (!release.signature) {
    return false;
  }
  return verifier.verify(releaseManifestSigningPayload(release), release.signature);
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
