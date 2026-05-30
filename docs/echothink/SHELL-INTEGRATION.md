# Echothink Shell Integration

This workbench shell exposes Echothink App-Domain governance through main-process IPC only. Renderer screens can call the generated `ipc.echothink.*` client; no renderer pages are wired yet.

## IPC Channels

- `echothink:list-domains`
- `echothink:get-domain`
- `echothink:create-domain`
- `echothink:delete-domain`
- `echothink:save-manifest`
- `echothink:compile-manifest`
- `echothink:generate-artifacts`
- `echothink:run-validation`
- `echothink:preview-start`
- `echothink:preview-run-process`
- `echothink:preview-query`
- `echothink:preview-explain-permission`
- `echothink:preview-set-persona`
- `echothink:preview-inspect`
- `echothink:preview-force-failure`
- `echothink:ui-registry-search`
- `echothink:ui-registry-list`
- `echothink:registry-list`
- `echothink:registry-get`
- `echothink:build-release`
- `echothink:promote`
- `echothink:record-approval`
- `echothink:harness-run`

## Database Tables

- `app_domains`: domain metadata, manifest YAML copy, lifecycle status, active version, and workspace path.
- `domain_validation_runs`: persisted validation reports from `@echothink/validation`.
- `domain_releases`: release manifests and promotion state by domain/version.
- `domain_approvals`: human approval records by domain/version/role.

Domain workspaces live under `path.join(getUserDataPath(), "echothink", "domains")`; each domain stores `domain.manifest.yaml` plus generated kernel, fixture, surface, validation, and release artifacts.
