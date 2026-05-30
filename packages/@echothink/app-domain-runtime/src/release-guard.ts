import type { CompiledManifest } from "@echothink/domain-manifest";
import type { SdkRequest } from "@echothink/app-domain-sdk";
import type { PromotionState, Sha256 } from "@echothink/shared-types";

export interface ReleaseManifestLike {
  manifestVersion?: string;
  manifestDigest?: Sha256;
  sdkContractVersion?: string;
  runtimeCompatibility?:
    | string
    | readonly string[]
    | {
        sdkContractVersion?: string;
        sdkContractVersions?: readonly string[];
      };
  surfaceDigests?: Record<string, Sha256>;
  promotionState?: PromotionState;
  state?: PromotionState;
  approved?: boolean;
}

export interface ReleaseGuardResult {
  ok: boolean;
  problems: string[];
}

export interface ReleaseGuard {
  verify(req: SdkRequest, release?: ReleaseManifestLike): ReleaseGuardResult;
}

export class DefaultReleaseGuard implements ReleaseGuard {
  constructor(private readonly compiled: CompiledManifest) {}

  verify(req: SdkRequest, release?: ReleaseManifestLike): ReleaseGuardResult {
    const problems: string[] = [];

    if (req.domainId !== this.compiled.manifest.metadata.id) {
      problems.push(
        `Request domainId ${req.domainId} does not match manifest ${this.compiled.manifest.metadata.id}.`,
      );
    }
    if (req.manifestVersion !== this.compiled.manifest.metadata.version) {
      problems.push(
        `Request manifestVersion ${req.manifestVersion} does not match compiled manifest ${this.compiled.manifest.metadata.version}.`,
      );
    }

    if (!release) {
      return {
        ok: problems.length === 0,
        problems: [
          ...problems,
          "No release manifest supplied; release checks skipped for preview/dev.",
        ],
      };
    }

    if (release.approved === false) {
      problems.push("Release manifest is explicitly unapproved.");
    }
    const state = release.promotionState ?? release.state;
    if (state !== undefined && !isApprovedState(state)) {
      problems.push(`Release state ${state} is not approved for runtime use.`);
    }

    if (
      release.manifestVersion !== undefined &&
      release.manifestVersion !== req.manifestVersion
    ) {
      problems.push(
        `Release manifestVersion ${release.manifestVersion} does not match request ${req.manifestVersion}.`,
      );
    }
    if (
      release.manifestDigest !== undefined &&
      release.manifestDigest !== this.compiled.manifestDigest
    ) {
      problems.push("Release manifestDigest does not match compiled manifest.");
    }

    const expectedSurfaceDigest = release.surfaceDigests?.[req.surfaceId];
    if (
      expectedSurfaceDigest !== undefined &&
      req.surfaceDigest !== expectedSurfaceDigest
    ) {
      problems.push(
        `Surface digest mismatch for ${req.surfaceId}: expected ${expectedSurfaceDigest}, got ${req.surfaceDigest ?? "missing"}.`,
      );
    }

    if (
      release.sdkContractVersion !== undefined &&
      release.sdkContractVersion !==
        this.compiled.manifest.metadata.sdkContractVersion
    ) {
      problems.push(
        `Release sdkContractVersion ${release.sdkContractVersion} does not match manifest ${this.compiled.manifest.metadata.sdkContractVersion}.`,
      );
    }

    if (!runtimeCompatibilityAllows(release.runtimeCompatibility, this.compiled)) {
      problems.push("Release runtimeCompatibility does not allow this SDK contract.");
    }

    return { ok: problems.length === 0, problems };
  }
}

function isApprovedState(state: PromotionState): boolean {
  return state === "approved" || state === "canary" || state === "production";
}

function runtimeCompatibilityAllows(
  compatibility: ReleaseManifestLike["runtimeCompatibility"],
  compiled: CompiledManifest,
): boolean {
  if (compatibility === undefined) {
    return true;
  }
  const sdkContractVersion = compiled.manifest.metadata.sdkContractVersion;
  if (typeof compatibility === "string") {
    return compatibility === sdkContractVersion;
  }
  if (isReadonlyStringArray(compatibility)) {
    return compatibility.includes(sdkContractVersion);
  }
  if (compatibility.sdkContractVersion !== undefined) {
    return compatibility.sdkContractVersion === sdkContractVersion;
  }
  if (compatibility.sdkContractVersions !== undefined) {
    return compatibility.sdkContractVersions.includes(sdkContractVersion);
  }
  return true;
}

function isReadonlyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value);
}
