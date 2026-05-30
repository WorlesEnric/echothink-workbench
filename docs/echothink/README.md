# Echothink-Workbench

A governed, AI-native **App Domain factory**. The workbench lets AI rapidly draft App
Domains, but production promotion is controlled by a stable kernel, a typed SDK, a strict
runtime capability boundary, and deterministic validation gates.

> **Founding rule:** *Schema controls the domain. Code controls the experience.
> Runtime controls the boundary.*

This repository is a fork of the Dyad open-source AI app builder, refactored so that Dyad
is the **interactive shell** while the Echothink governance layer is **authoritative**.

## The governance layer (`packages/@echothink/*`)

| Package | Responsibility |
| ------- | -------------- |
| `shared-types` | Primitive vocabulary + the single canonical `sha256OfCanonical` / `canonicalJSONStringify` (all digests route through it). |
| `domain-manifest` | Manifest Zod schema, YAML parser, semantic validators, deterministic compiler → `domain.manifest.lock.json`, and TypeScript kernel codegen (`generated-types.ts`, permission matrix, process/entity contracts, `capability-map.json`). The keystone. |
| `app-domain-sdk` | The only sanctioned path generated surfaces use to touch domain state: typed `useAppDomain` / `useProcess` / `useEntityQuery` / `entities` / `permissions` / `events` / `audit` / `effects`, over an injected `Transport`. Never performs raw IO. |
| `app-domain-runtime` | The production authority: identity, permission engine, entity gateway, unit-process engine, state machine, event bus, audit, effect invoker, release guard. Plus the **preview runtime** (same checks, no real side effects) used by the workbench. |
| `ui-registry` | Sidecar catalog of the `@echothink-ui/*` component library (no UI changes), page-template → component mapping, and standard-surface rendering. |
| `surface-factory` | Compiles a manifest into on-disk artifacts: kernel, standard surfaces, composed/custom scaffolds, fixtures, governance tests, docs, QA evidence. |
| `validation` | Deterministic gate pipeline (manifest, typescript, build, permission simulation, entity/process contract, security imports, dependency allowlist, effects, storybook/a11y/visual, release completeness) + the `echothink-validate` CLI. Per-surface-type gate matrix (spec §25). |
| `agent-harness` | Controlled Codex patch worker: file-scope policy, command allowlist, no network/secrets, patch capture, and the generate→typecheck→build→test→validate→repair loop. Codex can propose/repair but cannot bypass governance. |
| `registry` | App-Domain registry, promotion engine (state machine + required-approval gates), signed release manifests, hash verification, rollback. |

Every package: TypeScript strict, ESM, zod-guarded boundaries, no `any` in public APIs,
fully unit-tested with vitest, builds with `tsc`.

## The shell (Electron main + renderer)

The Dyad Electron app is the **creation and validation environment**. The governance
packages run in the **main process** and are exposed to the renderer over typed IPC
(`ipc.echothink.*`, contracts in `src/ipc/types/echothink.ts`, handlers in
`src/ipc/handlers/echothink_handlers.ts`). New SQLite tables (`app_domains`,
`domain_validation_runs`, `domain_releases`, `domain_approvals`) persist domain state.

Workbench screens (spec §7): Domain Brief, Manifest Studio, Surface Studio (Standard →
Composed → Custom lane switcher), Echothink-UI Registry Browser, Preview Runtime,
Diff/Patch Review, Validation Dashboard, Promotion Wizard.

## Reference domain

`domains/github-triage/` is the canonical example (spec §9/§26), materialized by the
surface factory: manifest, compiled lock, kernel, standard + composed surfaces, fixtures,
passing governance tests, docs, and QA evidence. It passes the full validation pipeline.

## Try it

```bash
# Validate the reference domain end-to-end (13 gates):
node packages/@echothink/validation/dist/cli.js domains/github-triage

# Run the reference domain's governance tests (via the runtime + preview):
cd domains/github-triage && npx vitest run

# Build/test any governance package:
cd packages/@echothink/<name> && npx tsc -p tsconfig.json && npx vitest run
```

## Key documents

- `docs/echothink/CONTRACT.md` — the canonical engineering contract (formats + interfaces).
- `docs/echothink/ECHOTHINK-UI-INVENTORY.md` — the real `@echothink-ui/*` component catalog.
- `docs/echothink/SHELL-INTEGRATION.md` — the IPC channels and DB tables added to the shell.
- `workbench_spec.md` — the architecture specification this implements.
