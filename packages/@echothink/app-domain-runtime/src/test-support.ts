import { readFileSync } from "node:fs";
import type { EffectImpl, SdkRequest } from "@echothink/app-domain-sdk";
import {
  compileManifest,
  parseManifestYaml,
  type AppDomainManifest,
  type CompiledManifest,
  AppDomainManifestSchema,
} from "@echothink/domain-manifest";

import type {
  AuditRecord,
  AuditSink,
  Clock,
  EntityQueryOptions,
  EntityStore,
  IdGenerator,
  SecretResolver,
} from "./adapters.js";
import { createRuntime, type DomainRuntime } from "./runtime.js";
import type { ReleaseManifestLike } from "./release-guard.js";

export const NOW = "2026-05-29T12:00:00.000Z";
export const DOMAIN_ID = "github-triage";
export const MANIFEST_VERSION = "0.4.0";
export const SURFACE_ID = "triage-console";

const fixtureYaml = readFileSync(
  new URL("../../../../domains/github-triage/domain.manifest.yaml", import.meta.url),
  "utf8",
);

export function compileGithubTriage(): CompiledManifest {
  return compileManifest(parseManifestYaml(fixtureYaml).manifest, { now: NOW });
}

export function cloneManifest(manifest: AppDomainManifest): AppDomainManifest {
  return AppDomainManifestSchema.parse(JSON.parse(JSON.stringify(manifest)));
}

export function createClock(): Clock {
  return { now: () => NOW };
}

export function createIds(): IdGenerator {
  let next = 0;
  return {
    next(prefix = "id") {
      next += 1;
      return `${prefix}_${next}`;
    },
  };
}

export function createIssues(): Record<string, unknown>[] {
  return [
    {
      id: "issue-1",
      tenantId: "org_456",
      repo: "dyad-sh/dyad",
      title: "Open issue",
      state: "open",
      labels: [],
      assignee: null,
      priority: "low",
      createdAt: "2026-05-01T00:00:00.000Z",
    },
    {
      id: "issue-2",
      tenantId: "org_456",
      repo: "dyad-sh/dyad",
      title: "Closed issue",
      state: "closed",
      labels: [],
      assignee: null,
      priority: "medium",
      createdAt: "2026-05-02T00:00:00.000Z",
    },
    {
      id: "issue-3",
      tenantId: "org_other",
      repo: "dyad-sh/dyad",
      title: "Other tenant",
      state: "open",
      labels: [],
      assignee: null,
      priority: "high",
      createdAt: "2026-05-03T00:00:00.000Z",
    },
  ];
}

export interface RuntimeHarness {
  compiled: CompiledManifest;
  runtime: DomainRuntime;
  store: TestEntityStore;
  audit: TestAuditSink;
}

export function createRuntimeHarness(opts: {
  role: string;
  env?: "preview" | "staging" | "production";
  compiled?: CompiledManifest;
  effects?: readonly EffectImpl<unknown, unknown>[];
  release?: ReleaseManifestLike;
}): RuntimeHarness {
  const compiled = opts.compiled ?? compileGithubTriage();
  const store = new TestEntityStore({ Issue: createIssues() });
  const audit = new TestAuditSink();
  const runtime = createRuntime({
    compiled,
    ...(opts.release ? { release: opts.release } : {}),
    entityStore: store,
    auditSink: audit,
    secretResolver: testSecretResolver,
    effects: opts.effects ?? [],
    clock: createClock(),
    ids: createIds(),
    env: opts.env ?? "production",
    roleMap: {
      "actor-1": { role: opts.role, tenantId: "org_456" },
    },
  });
  return { compiled, runtime, store, audit };
}

export function sdkRequest(
  capability: SdkRequest["capability"],
  target?: string,
  input?: unknown,
): SdkRequest {
  return {
    domainId: DOMAIN_ID,
    manifestVersion: MANIFEST_VERSION,
    surfaceId: SURFACE_ID,
    actorId: "actor-1",
    tenantId: "org_456",
    capability,
    ...(target ? { target } : {}),
    ...(input !== undefined ? { input } : {}),
  };
}

export class TestEntityStore implements EntityStore {
  private readonly records = new Map<string, Record<string, unknown>[]>();

  constructor(fixtures: Record<string, readonly Record<string, unknown>[]>) {
    for (const [entity, rows] of Object.entries(fixtures)) {
      this.records.set(entity, rows.map(cloneRecord));
    }
  }

  async query(
    entity: string,
    filter: Record<string, unknown>,
    opts: EntityQueryOptions,
  ): Promise<Record<string, unknown>[]> {
    void opts;
    return (this.records.get(entity) ?? [])
      .filter((record) => recordMatches(record, filter))
      .map(cloneRecord);
  }

  async get(
    entity: string,
    id: string,
    opts?: { tenantId?: string },
  ): Promise<Record<string, unknown> | null> {
    const record =
      (this.records.get(entity) ?? []).find(
        (candidate) =>
          candidate.id === id &&
          (opts?.tenantId === undefined || candidate.tenantId === opts.tenantId),
      ) ?? null;
    return record ? cloneRecord(record) : null;
  }

  async put(entity: string, record: Record<string, unknown>): Promise<void> {
    const rows = this.records.get(entity) ?? [];
    const index = rows.findIndex((candidate) => candidate.id === record.id);
    if (index >= 0) {
      rows[index] = cloneRecord(record);
    } else {
      rows.push(cloneRecord(record));
    }
    this.records.set(entity, rows);
  }
}

export class TestAuditSink implements AuditSink {
  readonly records: AuditRecord[] = [];

  async append(record: AuditRecord): Promise<void> {
    this.records.push(JSON.parse(JSON.stringify(record)) as AuditRecord);
  }

  async list(): Promise<AuditRecord[]> {
    return this.records.map(
      (record) => JSON.parse(JSON.stringify(record)) as AuditRecord,
    );
  }
}

const testSecretResolver: SecretResolver = {
  async get(ref) {
    return `test-secret:${ref}`;
  },
};

function recordMatches(
  record: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    if (expected !== undefined && record[key] !== expected) {
      return false;
    }
  }
  return true;
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}
