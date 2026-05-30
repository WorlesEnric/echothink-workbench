# @echothink/surface-factory

Generates on-disk App-Domain artifacts from a compiled Echothink domain manifest.

The factory aggregates:

- kernel artifacts from `@echothink/domain-manifest`
- standard surface descriptors from `@echothink/ui-registry`
- composed/custom surface scaffolds
- preview fixtures
- governance tests
- domain documentation

## API

```ts
import { generateDomain, writeDomain } from "@echothink/surface-factory";

const result = generateDomain(manifestYaml, {
  now: "2026-05-29T18:00:00.000Z",
  gitCommit: "abc123",
});

writeDomain("domains/github-triage", result);
```

Generated paths are relative to the domain directory. `writeDomain` refuses absolute
paths and path traversal outside the target domain directory.

## CLI

The package exports a `main` function for a simple command shape:

```sh
generate:domain <domainDir>
```

Package consumers may wire this to a bin if needed.
