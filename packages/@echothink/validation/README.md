# @echothink/validation

Deterministic validation gates and the `echothink-validate` CLI for Echothink App Domains.

The package reads a compiled domain manifest, runs the contract gates, and emits a `validation-report.json` shaped as `ValidationReport`.

## Gates

- `manifest-schema`: parses `domain.manifest.yaml` with the manifest schema.
- `manifest-semantic`: runs manifest semantic cross-reference validation.
- `typescript`: typechecks generated kernel files and composed/custom surface TypeScript with the TypeScript compiler API.
- `build`: verifies generated kernel artifacts and lockfile JSON, parses kernel TypeScript, and records surface bundle hashes.
- `permission-simulation`: uses the preview runtime to compare every role against surface required permissions and process permission expectations.
- `entity-contract`: validates normalized entity fields, state machines, refs, and relationships.
- `process-contract`: validates process inputs/outputs, reads/writes, transitions, emitted events, effects, and compensation references.
- `security-imports`: AST-scans composed/custom surfaces for forbidden frontend patterns and imports outside each surface `allowedImports`.
- `dependency-allowlist`: checks bare imports against the surface allowlist plus the base Echothink frontend allowlist.
- `effect-simulation`: requires preview effect stubs for used effects and validates effect `secretRef` and `egress.allowHosts`.
- `storybook`: checks composed/custom surfaces have `stories.tsx` evidence.
- `accessibility`: checks an accessibility evidence config exists.
- `visual`: checks a visual snapshot directory exists.
- `release-completeness`: validates `release.manifest.json` when present, otherwise skips draft domains.

Gate applicability is encoded in `GATE_MATRIX` for `standard`, `composed`, and `custom` surfaces.

## CLI

```sh
echothink-validate <domainDir> [--gates manifest-schema,permission-simulation] [--json validation-report.json] [--now 2026-05-29T12:00:00.000Z]
```

The CLI:

1. Parses `<domainDir>/domain.manifest.yaml`.
2. Compiles it with the injected `--now` timestamp.
3. Runs the selected gates, or the default gate set for the registered surface types.
4. Writes JSON when `--json` is provided.
5. Prints a concise summary.
6. Exits `0` on pass and `1` on fail.
