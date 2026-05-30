# @echothink/domain-manifest

Schema, parser, semantic validator, compiler, and kernel code generator for
Echothink App-Domain manifests.

## API

- `parseManifestYaml(yaml)` parses a `domain.manifest.yaml` string and throws
  `ManifestParseError` with Zod issues on invalid YAML or schema violations.
- `AppDomainManifestSchema` is the Zod schema for the manifest contract.
- `validateManifestSemantics(manifest)` returns cross-reference diagnostics for
  unknown permissions, roles, entities, events, effects, queries, states, and
  duplicate ids.
- `compileManifest(manifest, { now, gitCommit? })` produces deterministic
  normalized entities/processes, a permission matrix, capability map, surface
  registrations, and a canonical manifest digest.
- `generateKernel(compiled)` returns generated file contents for the domain
  lockfile, capability map, and TypeScript kernel artifacts.

## Usage

```ts
import { readFileSync } from "node:fs";
import {
  compileManifest,
  generateKernel,
  parseManifestYaml,
  validateManifestSemantics,
} from "@echothink/domain-manifest";

const source = readFileSync("domain.manifest.yaml", "utf8");
const { manifest } = parseManifestYaml(source);

const diagnostics = validateManifestSemantics(manifest);
if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
  throw new Error("Manifest has semantic errors");
}

const compiled = compileManifest(manifest, {
  now: "2026-05-29T12:00:00.000Z",
});
const files = generateKernel(compiled);
```
