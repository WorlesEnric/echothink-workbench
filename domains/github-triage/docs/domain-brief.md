# GitHub Triage

Triage incoming GitHub issues: prioritize, label, assign, and comment back to GitHub through governed unit processes.

## Ownership

- Domain ID: `github-triage`
- Owner: `platform-workflows`
- Version: `0.4.0`
- SDK contract: `1.2`
- UI registry: `2026.05`

## Entities

- `Issue` (organization scope): `id`, `repo`, `title`, `state`, `labels`, `assignee`, `priority`, `createdAt`

## Surfaces

- `issues-admin` (standard) at `/github/issues`
- `issue-detail` (standard) at `/github/issues/:id`
- `triage-form` (standard) at `/github/triage-form`
- `audit-log` (standard) at `/github/audit`
- `approval-queue` (standard) at `/github/approvals`
- `triage-console` (composed) at `/github/triage`

## External Effects

- `github.issue.comment` owned by `integrations-platform`; egress: api.github.com
- `github.issue.label` owned by `integrations-platform`; egress: api.github.com
