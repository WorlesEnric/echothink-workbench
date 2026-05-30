# Echothink-Workbench

A governed, AI-native **App Domain factory**. The workbench lets AI rapidly draft App
Domains, but production promotion is controlled by a stable kernel, a typed SDK, a strict
runtime capability boundary, and deterministic validation gates.

> **Founding rule:** *Schema controls the domain. Code controls the experience.
> Runtime controls the boundary.*

This repository is a fork of the [Dyad](https://dyad.sh/) open-source AI app builder,
refactored so that Dyad is the **interactive shell** (an Electron + React 19 + TanStack
Router + Drizzle/SQLite desktop app) while the Echothink governance layer is
**authoritative**. The governance layer is a set of `@echothink/*` packages that run in
the Electron **main process** and are exposed to the renderer over typed IPC.

---

## What's in this repo

```
echothink-workbench/
├── packages/@echothink/*        # the governance layer (9 packages, see below)
├── src/                         # the Dyad/Electron shell (main + renderer)
│   ├── ipc/types/echothink.ts       # IPC contracts for the workbench
│   ├── ipc/handlers/echothink_handlers.ts
│   ├── hooks/useEchothink.ts         # renderer React-Query hooks
│   ├── routes/workbench*.tsx         # /workbench routes
│   └── components/workbench/*         # the 8 workbench screens
├── domains/github-triage/       # the canonical reference App Domain
├── docs/echothink/              # the engineering contract + integration docs
└── workbench_spec.md            # the architecture specification
```

### The governance layer (`packages/@echothink/*`)

| Package | Responsibility |
| ------- | -------------- |
| `shared-types` | Primitive vocabulary + the single canonical `sha256OfCanonical` / `canonicalJSONStringify` (all digests route through it). |
| `domain-manifest` | Manifest Zod schema, YAML parser, semantic validators, deterministic compiler → `domain.manifest.lock.json`, and TypeScript kernel codegen. The keystone. |
| `app-domain-sdk` | The only sanctioned path generated surfaces use to touch domain state (`useAppDomain` / `useProcess` / `useEntityQuery` / `entities` / `permissions` / `events` / `audit` / `effects`), over an injected `Transport`. Never performs raw IO. |
| `app-domain-runtime` | The production authority: identity, permission engine, entity gateway, unit-process engine, state machine, event bus, audit, effect invoker, release guard. Plus the **preview runtime** (same checks, no real side effects). |
| `ui-registry` | Sidecar catalog of the `@echothink-ui/*` component library, page-template → component mapping, and standard-surface rendering. |
| `surface-factory` | Compiles a manifest into on-disk artifacts: kernel, standard surfaces, composed/custom scaffolds, fixtures, governance tests, docs, QA evidence. |
| `validation` | Deterministic gate pipeline + the `echothink-validate` CLI. Per-surface-type gate matrix (spec §25). |
| `agent-harness` | Controlled Codex patch worker: file-scope policy, command allowlist, no network/secrets, and the generate→typecheck→build→test→validate→repair loop. |
| `registry` | App-Domain registry, promotion engine (state machine + required-approval gates), signed release manifests, hash verification, rollback. |

Every package is TypeScript strict, ESM, zod-guarded, fully unit-tested with vitest, and
builds with `tsc`.

---

## Prerequisites

- **Node.js ≥ 24 < 26** (see `engines` in `package.json`)
- **npm** (the package layout uses npm `file:` workspace deps)
- macOS, Windows, or Linux (Electron 40)

---

## 1. Install

```bash
cd echothink-workbench
npm install
```

This installs the Dyad shell dependencies and links the nine `@echothink/*` packages via
`file:` deps. Each governance package is then built once with `tsc` (see next step).

## 2. Build the governance packages

The packages must be compiled (each emits `dist/`) before the shell or the CLI can use
them. Build them in dependency order — `shared-types` first, then the rest:

```bash
# Build all governance packages (dependency order):
for pkg in shared-types domain-manifest app-domain-sdk app-domain-runtime \
           ui-registry surface-factory validation registry agent-harness; do
  ( cd "packages/@echothink/$pkg" && npx tsc -p tsconfig.json )
done
```

Verify the build by running every package's unit tests:

```bash
for pkg in packages/@echothink/*/ ; do ( cd "$pkg" && npx vitest run ); done
```

## 3. Run the workbench (the Electron app)

```bash
npm run dev          # development mode (cross-env NODE_ENV=development electron-forge start)
# or
npm start            # electron-forge start
```

The app launches the Dyad shell. Open the **Workbench** entry in the left sidebar to reach
the App-Domain factory at the `/workbench` route.

To produce a packaged desktop build:

```bash
npm run package      # unpackaged app in out/
npm run make         # platform installers
```

---

## Using the workbench

The workbench guides an App Domain from a one-paragraph brief to a signed production
release, through the screens below (spec §7). All of them are backed by the governance
packages running in the main process — there is no way to bypass a gate from the UI.

1. **Domains list / Domain Brief** (`/workbench`) — create a new App Domain from
   `id` / `name` / `owner` / brief. Scaffolds a workspace and a seed manifest.
2. **Manifest Studio** — Monaco YAML editor bound to the domain manifest. *Save* runs
   semantic validators; *Compile* produces the `domain.manifest.lock.json`, manifest
   digest, capability counts, and permission-matrix; *Generate Artifacts* materializes the
   kernel + surfaces on disk.
3. **Surface Studio** — surfaces grouped by mode with the **Standard → Composed → Custom**
   lane switcher and the risk labels + validation requirements per mode (spec §13/§25).
4. **Echothink-UI Registry Browser** — search the `@echothink-ui/*` catalog by kind and
   surface type; inspect imports, data bindings, allowed actions, examples.
5. **Preview Runtime** — a **persona switcher**, a process runner (run a unit process and
   see the full `SdkResponse`, including denial reasons), a permission explainer, audit +
   event inspectors, and a **Force Failure** control to exercise error boundaries — all
   with the real permission/state-machine checks but **no real side effects**.
6. **Validation Dashboard** — *Run Validation* renders the report gate-by-gate (status,
   findings, durations) and shows which gates block promotion.
7. **Diff / Patch Review** — the files produced by the last *Generate Artifacts* run, plus
   a **Codex Repair** action that drives the governed agent-harness repair loop.
8. **Promotion Wizard** — *Build Release* shows the signed release manifest; record the
   required approvals per role (spec §28) and step the domain through
   `draft → … → production`, with promotion errors surfaced inline.

### Try the reference domain from the command line

`domains/github-triage/` is the canonical example (spec §9/§26), already materialized.

```bash
# Validate the reference domain end-to-end (13 gates):
node packages/@echothink/validation/dist/cli.js domains/github-triage

# Run the reference domain's governance tests (runtime + preview):
( cd domains/github-triage && npx vitest run )
```

The validation CLI is also installed as `echothink-validate` (bin in
`packages/@echothink/validation`); you can run it against any domain directory that
contains a `domain.manifest.yaml`.

---

## Developing on the shell

```bash
npm run ts           # typecheck main + workers (tsgo + tsc)
npm run lint         # oxlint --fix
npm run fmt          # oxfmt
npm test             # the shell's vitest suite
npm run db:generate  # regenerate Drizzle migrations after editing src/db/schema.ts
```

The workbench adds four SQLite tables (`app_domains`, `domain_validation_runs`,
`domain_releases`, `domain_approvals`) and the `ipc.echothink.*` channel family. After
editing `src/db/schema.ts`, run `npm run db:generate` and commit the new file under
`drizzle/`.

---

## Key documents

- `docs/echothink/README.md` — governance-layer overview.
- `docs/echothink/CONTRACT.md` — the canonical engineering contract (formats + interfaces).
- `docs/echothink/ECHOTHINK-UI-INVENTORY.md` — the real `@echothink-ui/*` component catalog.
- `docs/echothink/SHELL-INTEGRATION.md` — the IPC channels and DB tables added to the shell.
- `workbench_spec.md` — the architecture specification this repo implements.

## License

Inherited from the upstream Dyad project:

- All code outside `src/pro` is open-source under Apache 2.0 — see [LICENSE](./LICENSE).
- All code within `src/pro` is fair-source under
  [Functional Source License 1.1 Apache 2.0](https://fsl.software/) — see
  [src/pro/LICENSE](./src/pro/LICENSE).
