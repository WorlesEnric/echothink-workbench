import { z } from "zod";
import {
  APPROVAL_ROLES,
  AUDIT_LEVELS,
  ENVIRONMENTS,
  POLICY_CLASSES,
  RELEASE_CHANNELS,
  SURFACE_TYPES,
} from "./constants.js";
import { isValidFieldSpecString } from "./field-spec.js";

const MetadataIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "must be kebab-case");
const RoleIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]*$/, "must be lower snake/kebab case");
const DottedIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/,
    "must be a dotted lower-case id",
  );
const SemVerSchema = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/,
    "must be a semantic version",
  );

const FieldSpecTypeStringSchema = z.string().refine(
  (value) => isValidFieldSpecString(value, { allowInlineEnum: false }),
  "must be a supported field type",
);

const FieldSpecStringSchema = z.string().refine(
  (value) => isValidFieldSpecString(value, { allowInlineEnum: false }),
  "must be a supported field shorthand",
);

const IoFieldSpecStringSchema = z.string().refine(
  (value) => isValidFieldSpecString(value, { allowInlineEnum: true }),
  "must be a supported IO field shorthand",
);

const FieldSpecObjectSchema = z.union([
  z
    .object({
      type: FieldSpecTypeStringSchema,
      optional: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      enum: z.array(z.string()).min(1),
      optional: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ref: z.string().min(1),
      optional: z.boolean().optional(),
    })
    .strict(),
]);

export const FieldSpecSchema = z.union([
  FieldSpecStringSchema,
  FieldSpecObjectSchema,
]);
export type FieldSpec = z.infer<typeof FieldSpecSchema>;

export const IoFieldSpecSchema = z.union([
  IoFieldSpecStringSchema,
  FieldSpecObjectSchema,
]);
export type IoFieldSpec = z.infer<typeof IoFieldSpecSchema>;

export const RoleSchema = z
  .object({
    id: RoleIdSchema,
    name: z.string().optional(),
    description: z.string().optional(),
    assignable: z.boolean().optional(),
    delegatable: z.boolean().optional(),
  })
  .strict();
export type Role = z.infer<typeof RoleSchema>;

export const PersonaSchema = z
  .object({
    id: z.string().min(1),
    role: RoleIdSchema,
    tenantId: z.string().optional(),
    label: z.string().optional(),
    invalid: z.boolean().optional(),
  })
  .strict();
export type Persona = z.infer<typeof PersonaSchema>;

export const EntitySchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_-]*$/, "must be lower-case"),
    schema: z.record(FieldSpecSchema),
    tenantScope: z.enum(["workspace", "organization", "system"]),
    stateField: z.string().optional(),
    stateMachine: z
      .object({
        initial: z.string(),
        transitions: z.array(
          z
            .object({
              from: z.string(),
              to: z.string(),
              via: DottedIdSchema.optional(),
            })
            .strict(),
        ),
      })
      .strict()
      .optional(),
    relationships: z
      .record(
        z
          .object({
            entity: z.string(),
            cardinality: z.enum(["one", "many"]),
          })
          .strict(),
      )
      .optional(),
    sensitivity: z.array(z.string()).optional(),
    retention: z.string().optional(),
    audit: z
      .object({
        read: z.enum(AUDIT_LEVELS).optional(),
        write: z.enum(AUDIT_LEVELS).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Entity = z.infer<typeof EntitySchema>;

export const QuerySchema = z
  .object({
    entity: z.string(),
    filter: z.record(z.unknown()).optional(),
    sortableBy: z.array(z.string()).optional(),
    permissions: z
      .object({
        read: DottedIdSchema.optional(),
      })
      .strict()
      .optional(),
    pageable: z.boolean().optional(),
  })
  .strict();
export type Query = z.infer<typeof QuerySchema>;

export const PermissionSchema = z
  .object({
    id: DottedIdSchema,
    roles: z.array(RoleIdSchema),
    description: z.string().optional(),
  })
  .strict();
export type Permission = z.infer<typeof PermissionSchema>;

const TransitionValueSchema = z.union([
  z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .strict(),
  z.record(z.string()),
]);

export const UnitProcessSchema = z
  .object({
    input: z.record(IoFieldSpecSchema),
    output: z.record(IoFieldSpecSchema).optional(),
    requires: z
      .object({
        permission: DottedIdSchema.optional(),
      })
      .strict()
      .optional(),
    preconditions: z.array(z.string()).optional(),
    reads: z.array(z.string()).optional(),
    writes: z.array(z.string()).optional(),
    transitions: z.record(TransitionValueSchema).optional(),
    emits: z.array(DottedIdSchema).optional(),
    effects: z.array(DottedIdSchema).optional(),
    audit: z
      .object({
        level: z.enum(AUDIT_LEVELS),
        reasonRequired: z.boolean().optional(),
      })
      .strict()
      .optional(),
    idempotency: z
      .object({
        key: z.string(),
      })
      .strict()
      .optional(),
    compensation: DottedIdSchema.optional(),
    actorType: z.enum(["human", "system", "ai", "mixed"]).optional(),
    policyClass: z.enum(POLICY_CLASSES).optional(),
  })
  .strict();
export type UnitProcess = z.infer<typeof UnitProcessSchema>;

export const EventDefSchema = z
  .object({
    payload: z.record(IoFieldSpecSchema),
  })
  .strict();
export type EventDef = z.infer<typeof EventDefSchema>;

export const EffectDefSchema = z
  .object({
    owner: z.string().optional(),
    version: z.string().optional(),
    input: z.record(IoFieldSpecSchema).optional(),
    output: z.record(IoFieldSpecSchema).optional(),
    requiredPermission: DottedIdSchema.optional(),
    secretRef: z.string().optional(),
    egress: z
      .object({
        allowHosts: z.array(z.string()),
      })
      .strict()
      .optional(),
    audit: z
      .object({
        redact: z.array(z.string()).optional(),
        level: z.enum(AUDIT_LEVELS).optional(),
      })
      .strict()
      .optional(),
    idempotency: z
      .object({
        key: z.string(),
      })
      .strict()
      .optional(),
    rateLimit: z
      .object({
        perMinute: z.number().optional(),
        perHour: z.number().optional(),
      })
      .strict()
      .optional(),
    retry: z
      .object({
        maxAttempts: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
    environments: z.array(z.enum(ENVIRONMENTS)).optional(),
    frontendInvocable: z.boolean().optional(),
  })
  .strict();
export type EffectDef = z.infer<typeof EffectDefSchema>;

export const SurfaceSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(SURFACE_TYPES),
    route: z.string().min(1),
    requiredPermissions: z.array(DottedIdSchema).optional(),
    page: z.string().optional(),
    query: z.string().min(1).optional(),
    bindings: z.record(z.unknown()).optional(),
    entry: z.string().optional(),
    allowedImports: z.array(z.string()).optional(),
    exceptionFile: z.string().optional(),
    isolation: z.enum(["none", "iframe", "worker"]).optional(),
  })
  .strict();
export type Surface = z.infer<typeof SurfaceSchema>;

export const ReleaseSpecSchema = z
  .object({
    channel: z.enum(RELEASE_CHANNELS),
    requiredApprovals: z.array(
      z.union([
        z.enum(APPROVAL_ROLES),
        z.literal("security-if-effects-changed"),
      ]),
    ),
  })
  .strict();
export type ReleaseSpec = z.infer<typeof ReleaseSpecSchema>;

export const AppDomainManifestSchema = z
  .object({
    apiVersion: z.literal("echothink.ai/v1"),
    kind: z.literal("AppDomain"),
    metadata: z
      .object({
        id: MetadataIdSchema,
        name: z.string(),
        owner: z.string(),
        version: SemVerSchema,
        sdkContractVersion: z.string(),
        uiRegistryVersion: z.string(),
        description: z.string().optional(),
      })
      .strict(),
    identity: z
      .object({
        roles: z.array(RoleSchema),
        personas: z.array(PersonaSchema).optional(),
      })
      .strict(),
    entities: z.record(EntitySchema),
    queries: z.record(QuerySchema),
    permissions: z.array(PermissionSchema),
    unitProcesses: z.record(UnitProcessSchema),
    events: z.record(EventDefSchema),
    effects: z.record(EffectDefSchema),
    surfaces: z.array(SurfaceSchema),
    release: ReleaseSpecSchema,
  })
  .strict();
export type AppDomainManifest = z.infer<typeof AppDomainManifestSchema>;
