import type {
  AuditLevel,
  FieldKind,
  PolicyClass,
  Sha256,
  SurfaceType,
} from "@echothink/shared-types";
import type { AppDomainManifest } from "./schema.js";

export interface NormalizedField {
  name: string;
  kind: FieldKind;
  optional: boolean;
  enumValues?: string[];
  arrayOf?: FieldKind;
  refEntity?: string;
}

export interface NormalizedEntity {
  name: string;
  key: string;
  fields: NormalizedField[];
  tenantScope: "workspace" | "organization" | "system";
  stateField?: string;
  stateMachine?: {
    initial: string;
    transitions: Array<{ from: string; to: string; via?: string }>;
  };
  relationships?: Record<string, { entity: string; cardinality: "one" | "many" }>;
  sensitivity?: string[];
  retention?: string;
  audit?: { read?: AuditLevel; write?: AuditLevel };
}

export type NormalizedTransition =
  | {
      kind: "exact";
      target: string;
      entity: string;
      field: string;
      from?: string;
      to?: string;
    }
  | {
      kind: "input-map";
      target: string;
      entity: string;
      field: string;
      mapping: Record<string, string>;
    };

export interface NormalizedProcess {
  id: string;
  input: NormalizedField[];
  output: NormalizedField[];
  requires?: { permission?: string };
  preconditions: string[];
  reads: string[];
  writes: string[];
  transitions: NormalizedTransition[];
  emits: string[];
  effects: string[];
  audit?: { level: AuditLevel; reasonRequired?: boolean };
  idempotency?: { key: string };
  compensation?: string;
  actorType?: "human" | "system" | "ai" | "mixed";
  policyClass?: PolicyClass;
}

export interface SemanticDiagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  path: string;
}

export type PermissionCapability =
  | "process.run"
  | "entity.query"
  | "entity.get"
  | "event.subscribe"
  | "effect.invoke";

export interface PermissionMatrixRow {
  role: string;
  capability: PermissionCapability;
  target: string;
  permission?: string;
  allowed: boolean;
}

export interface CapabilityMap {
  entities: string[];
  queries: string[];
  processes: string[];
  events: string[];
  effects: string[];
}

export interface SurfaceRegistration {
  id: string;
  type: SurfaceType;
  route: string;
  page?: string;
  query?: string;
  requiredPermissions: string[];
  entry?: string;
  allowedImports?: string[];
  isolation?: "none" | "iframe" | "worker";
}

export interface CompileOptions {
  now: string;
  gitCommit?: string;
}

export interface CompiledManifest {
  manifest: AppDomainManifest;
  normalizedEntities: NormalizedEntity[];
  normalizedProcesses: NormalizedProcess[];
  permissionMatrix: PermissionMatrixRow[];
  capabilityMap: CapabilityMap;
  manifestDigest: Sha256;
  surfaceRegistrations: SurfaceRegistration[];
  compiledAt: string;
}

export interface GeneratedFile {
  path: string;
  contents: string;
}
