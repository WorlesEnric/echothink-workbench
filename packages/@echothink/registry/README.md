# @echothink/registry

App-Domain registry, promotion engine, and signed release manifest utilities for
Echothink-Workbench.

This package is the catalog and promotion authority for validated App-Domain
releases. It builds deterministic release manifests from compiled domain
manifests, signs those releases through a pluggable signer, verifies release
digests, tracks registry records, and enforces legal promotion transitions plus
human approval gates.

## Public API

- `buildReleaseManifest` creates a deterministic release manifest from a
  `CompiledManifest`, git commit, surface file contents, compatibility metadata,
  and validation report reference.
- `signReleaseManifest` and `verifyReleaseSignature` sign and verify the
  canonical release body excluding the `signature` field.
- `PromotionEngine` enforces the promotion graph and approval requirements from
  the workbench spec.
- `verifyRelease` recomputes the manifest and surface digests to mirror runtime
  ReleaseGuard checks.
- `AppDomainRegistry` provides an in-memory registry with version, status,
  approval, surface-hash, and compatibility operations.
- `createInMemoryRegistryStore` and `createJsonRegistryStore` provide pluggable
  persistence seams.
- `formatCommitMessage` and `versionImpact` implement the workbench commit
  metadata and version-impact rules.

## Verification

```sh
npm install
npx tsc -p tsconfig.json
npx vitest run
```
