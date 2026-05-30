import type { Environment } from "@echothink/shared-types";
import type { IdentityContext } from "@echothink/app-domain-sdk";

export interface EntityQueryOptions {
  tenantId?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface EntityStore {
  query(
    entity: string,
    filter: Record<string, unknown>,
    opts: EntityQueryOptions,
  ): Promise<Record<string, unknown>[]>;
  get(
    entity: string,
    id: string,
    opts?: { tenantId?: string },
  ): Promise<Record<string, unknown> | null>;
  put(entity: string, record: Record<string, unknown>): Promise<void>;
}

export interface AuditRecord {
  id: string;
  ts: string;
  actorId: string;
  tenantId: string;
  domainId: string;
  surfaceId?: string;
  capability: string;
  target?: string;
  result: "ok" | "denied" | "error";
  reason?: string;
  redactedInput?: unknown;
}

export interface AuditSink {
  append(record: AuditRecord): Promise<void>;
  list?(): Promise<AuditRecord[]>;
}

export interface SecretResolver {
  get(ref: string): Promise<string>;
}

export interface Clock {
  now(): string;
}

export interface IdGenerator {
  next(prefix?: string): string;
}

export interface EmittedEvent {
  id: string;
  ts: string;
  type: string;
  payload: unknown;
  actorId: string;
  tenantId: string;
}

export interface IdentityContextResolver {
  resolve(actorId: string, tenantId: string): Promise<IdentityContext>;
}

export interface RuntimeContext extends IdentityContext {
  domainId: string;
  surfaceId?: string;
  env: Environment;
}
