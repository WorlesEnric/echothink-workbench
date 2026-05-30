# @echothink/ui-registry

Sidecar registry for the pre-existing `@echothink-ui/*` component library. This package does not modify the UI packages; it describes their exported primitives, blocks, page templates, and approved composition recipes so the workbench Registry Browser and standard-surface factory can make deterministic choices.

## Contents

- `src/catalog.ts` contains the typed `RegistryComponent[]` seeded from `docs/echothink/ECHOTHINK-UI-INVENTORY.md`.
- `src/templates/*.ts` maps manifest `surface.page` ids such as `EntityTable` and `EntityForm` to standard-surface YAML descriptors under `surfaces/standard/*.surface.yaml`.
- `src/recipes.ts` lists approved composed-surface recipes that agents can reuse.
- `src/registry.ts` exports the `uiRegistry` singleton, `uiRegistryVersion`, lookup/search helpers, and `getComponentImportsForSurface`.

## Standard Surfaces

Each `SurfaceTemplate.render(ctx)` emits one config-driven artifact for one manifest surface. The descriptor includes:

- the logical template id,
- the real `@echothink-ui` component package and import,
- layout imports for `AppPageLayout` and `PageHeader`,
- entity fields, query binding, process actions, and required permissions derived from the compiled manifest.

For example, the logical `EntityTable` template maps to the real `DataTable` export from `@echothink-ui/data`. There is no literal `EntityTable` export in the UI library.

## Adding a Page Template

1. Add the real component imports to `src/templates/imports.ts`.
2. Add a new `SurfaceTemplate` in `src/templates/<template>.ts`.
3. Use helpers from `src/templates/shared.ts` to resolve the entity, query, fields, and matching unit processes from `StandardSurfaceContext`.
4. Export the template from `src/templates/index.ts`.
5. Add catalog metadata for any newly referenced UI components in `src/catalog.ts`.
6. Add or update Vitest coverage proving the generated YAML is deterministic and bound to manifest data rather than hardcoded fixture values.

Run:

```sh
npx tsc -p tsconfig.json
npx vitest run
```
