# @echothink/agent-harness

Controlled Codex patch worker for Echothink App Domains.

The harness lets Codex draft and repair domain files while keeping governance outside the model. Codex can propose patches, but the harness checks the resulting filesystem diff, records the run, and rejects anything outside the configured policy.

## Policy Model

`defaultDomainPolicy(domainDir)` creates the default App Domain policy:

- Codex may write only `surfaces/**`, `fixtures/**`, `docs/**`, and `domain.manifest.yaml`.
- Codex may not write generated kernel files, `**/*.generated.*`, `release.manifest.json`, `validation/**`, or anything under `packages/@echothink/**`.
- Commands are restricted to the allowlist in `DEFAULT_COMMAND_ALLOWLIST`.
- Network policy is `disabled`.
- New dependency changes are not allowed.

The runner snapshots files before and after Codex executes. If the diff includes denied or platform-owned paths, those changes are reported in `blockedActions` and reverted by default. If any `package.json` dependency section changes while `allowNewDependencies` is false, that file is also blocked and restored.

Codex cannot promote releases, edit validation evidence, change platform packages, register production effects, access secrets from the process environment, or add arbitrary dependencies through this harness.

## Runner

`createCodexRunner()` invokes:

```sh
codex exec --full-auto --skip-git-repo-check -o <tmp-output> -
```

The prompt is piped on stdin. Tests can inject an `ExecFn`, so unit tests never need the real Codex binary.

Every run writes artifacts under:

```text
<domainDir>/.workbench/runs/<runId>/
```

Those artifacts include `prompt.txt`, `patch-summary.json`, `command-outputs.json`, and `agent-contract.json`.

## Repair Loop

`runRepairLoop()` runs Codex, calls an external validation function, and stops when validation passes or `maxIterations` is reached. When validation fails, the default repair prompt lists failing gates and error findings, then instructs Codex to repair only within the harness file scope.

Validation remains owned by the external pipeline. The agent can read validation failures and propose repairs, but it cannot edit validation artifacts or disable gates under the default policy.
