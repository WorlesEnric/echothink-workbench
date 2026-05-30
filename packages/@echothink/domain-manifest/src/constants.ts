import type {
  ApprovalRole,
  AuditLevel,
  Environment,
  FieldKind,
  PolicyClass,
  ReleaseChannel,
  SurfaceType,
} from "@echothink/shared-types";

export const AUDIT_LEVELS = [
  "none",
  "sampled",
  "always",
] as const satisfies readonly AuditLevel[];

export const POLICY_CLASSES = [
  "read_only",
  "side_effect_low",
  "side_effect_high",
  "sensitive",
] as const satisfies readonly PolicyClass[];

export const ENVIRONMENTS = [
  "preview",
  "staging",
  "production",
] as const satisfies readonly Environment[];

export const SURFACE_TYPES = [
  "standard",
  "composed",
  "custom",
] as const satisfies readonly SurfaceType[];

export const RELEASE_CHANNELS = [
  "candidate",
  "stable",
  "canary",
] as const satisfies readonly ReleaseChannel[];

export const APPROVAL_ROLES = [
  "domain-owner",
  "platform-architect",
  "security",
  "qa",
  "release-manager",
  "integration-owner",
] as const satisfies readonly ApprovalRole[];

export const FIELD_KINDS = [
  "string",
  "number",
  "boolean",
  "date",
  "json",
  "enum",
  "ref",
] as const satisfies readonly FieldKind[];

export const SCALAR_FIELD_KINDS = [
  "string",
  "number",
  "boolean",
  "date",
  "json",
] as const;

export const ARRAY_FIELD_KINDS = ["string", "number"] as const;

export const KNOWN_STANDARD_PAGES = [
  "EntityTable",
  "EntityDetail",
  "EntityForm",
  "AuditLog",
  "ApprovalQueue",
  "Settings",
] as const;
