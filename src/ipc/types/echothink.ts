import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";
import type {
  CapabilityMap,
  PermissionMatrixRow,
  SemanticDiagnostic,
} from "@echothink/domain-manifest";
import type { SdkResponse } from "@echothink/app-domain-sdk";
import type {
  RegistryComponent,
  RegistryRecipe,
  SurfaceTemplate,
} from "@echothink/ui-registry";
import type {
  PromotionEvidence,
  RegistryRecord,
  ReleaseManifest,
} from "@echothink/registry";
import type { GateId, ValidationReport } from "@echothink/validation";
import type { ApprovalRole, PromotionState } from "@echothink/shared-types";

export type {
  AppDomainManifest,
  CapabilityMap,
  CompiledManifest,
  PermissionMatrixRow,
  SemanticDiagnostic,
  SurfaceRegistration,
} from "@echothink/domain-manifest";
export type { SdkRequest, SdkResponse } from "@echothink/app-domain-sdk";
export type {
  RegistryComponent,
  RegistryRecipe,
  SurfaceTemplate,
} from "@echothink/ui-registry";
export type {
  ChangeKind,
  PromotionEvidence,
  RegistryRecord,
  ReleaseManifest,
} from "@echothink/registry";
export type { GateId, ValidationReport } from "@echothink/validation";
export type { ApprovalRole, PromotionState } from "@echothink/shared-types";

const domainIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "Domain id must be kebab-case");

const semanticDiagnosticSchema = z.object({
  severity: z.enum(["error", "warning"]),
  code: z.string(),
  message: z.string(),
  path: z.string(),
}) satisfies z.ZodType<SemanticDiagnostic>;

const promotionStateSchema = z.enum([
  "draft",
  "validated-draft",
  "release-candidate",
  "approved",
  "canary",
  "production",
  "deprecated",
  "rolled-back",
]) satisfies z.ZodType<PromotionState>;

const approvalRoleSchema = z.enum([
  "domain-owner",
  "platform-architect",
  "security",
  "qa",
  "release-manager",
  "integration-owner",
]) satisfies z.ZodType<ApprovalRole>;

const gateIdSchema = z.enum([
  "manifest-schema",
  "manifest-semantic",
  "typescript",
  "build",
  "permission-simulation",
  "entity-contract",
  "process-contract",
  "security-imports",
  "dependency-allowlist",
  "effect-simulation",
  "storybook",
  "accessibility",
  "visual",
  "release-completeness",
]) satisfies z.ZodType<GateId>;

const surfaceTypeSchema = z.enum(["standard", "composed", "custom"]);

const registryComponentKindSchema = z.enum([
  "primitive",
  "block",
  "page-template",
  "recipe",
]);

const permissionCapabilitySchema = z.enum([
  "process.run",
  "entity.query",
  "entity.get",
  "event.subscribe",
  "effect.invoke",
]);

const looseRecordSchema = z.record(z.string(), z.unknown());
const validationReportSchema = z.any() as z.ZodType<ValidationReport>;
const releaseManifestSchema = z.any() as z.ZodType<ReleaseManifest>;
const registryRecordSchema = z.any() as z.ZodType<RegistryRecord>;
const sdkResponseSchema = z.any() as z.ZodType<SdkResponse>;
const registryComponentSchema = z.any() as z.ZodType<RegistryComponent>;
const registryRecipeSchema = z.any() as z.ZodType<RegistryRecipe>;
const surfaceTemplateSchema = z.any() as z.ZodType<SurfaceTemplate>;

export const DomainValidationSummarySchema = z.object({
  runId: z.string(),
  overall: z.string(),
  gateCount: z.number(),
  errorCount: z.number(),
  createdAt: z.date(),
});

export type DomainValidationSummary = z.infer<
  typeof DomainValidationSummarySchema
>;

export const DomainSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string().nullable(),
  brief: z.string().nullable(),
  status: promotionStateSchema,
  activeVersion: z.string().nullable(),
  workspacePath: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type DomainSummary = z.infer<typeof DomainSummarySchema>;

export const DomainDetailSchema = DomainSummarySchema.extend({
  manifestYaml: z.string().nullable(),
  lastValidation: DomainValidationSummarySchema.nullable(),
});

export type DomainDetail = z.infer<typeof DomainDetailSchema>;

export const SaveManifestResultSchema = z.object({
  ok: z.boolean(),
  diagnostics: z.array(semanticDiagnosticSchema),
});

export type SaveManifestResult = z.infer<typeof SaveManifestResultSchema>;

export const CompileManifestResultSchema = z.object({
  manifestDigest: z.string(),
  capabilityCounts: z.object({
    entities: z.number(),
    queries: z.number(),
    processes: z.number(),
    events: z.number(),
    effects: z.number(),
  }) satisfies z.ZodType<Record<keyof CapabilityMap, number>>,
  permissionMatrixRows: z.array(
    z.object({
      role: z.string(),
      capability: permissionCapabilitySchema,
      target: z.string(),
      permission: z.string().optional(),
      allowed: z.boolean(),
    }),
  ) as z.ZodType<PermissionMatrixRow[]>,
  diagnostics: z.array(semanticDiagnosticSchema),
});

export type CompileManifestResult = z.infer<typeof CompileManifestResultSchema>;

export const PreviewStartResultSchema = z.object({
  sessionId: z.string(),
  personas: z.array(looseRecordSchema),
  surfaces: z.array(looseRecordSchema),
});

export type PreviewStartResult = z.infer<typeof PreviewStartResultSchema>;

export const UiRegistryListSchema = z.object({
  components: z.array(registryComponentSchema),
  blocks: z.array(registryComponentSchema),
  pageTemplates: z.array(surfaceTemplateSchema),
  recipes: z.array(registryRecipeSchema),
});

export type UiRegistryList = z.infer<typeof UiRegistryListSchema>;

export const HarnessRunResultSchema = z.object({
  ok: z.boolean(),
  report: validationReportSchema,
  iterations: z.number(),
  blockedActions: z.array(z.string()),
});

export type HarnessRunResult = z.infer<typeof HarnessRunResultSchema>;

export const echothinkContracts = {
  listDomains: defineContract({
    channel: "echothink:list-domains",
    input: z.void(),
    output: z.array(DomainSummarySchema),
  }),

  getDomain: defineContract({
    channel: "echothink:get-domain",
    input: z.object({ domainId: domainIdSchema }),
    output: DomainDetailSchema,
  }),

  createDomain: defineContract({
    channel: "echothink:create-domain",
    input: z.object({
      id: domainIdSchema,
      name: z.string().min(1),
      owner: z.string().min(1).optional(),
      brief: z.string().optional(),
    }),
    output: DomainDetailSchema,
  }),

  deleteDomain: defineContract({
    channel: "echothink:delete-domain",
    input: z.object({ domainId: domainIdSchema }),
    output: z.object({ ok: z.literal(true) }),
  }),

  saveManifest: defineContract({
    channel: "echothink:save-manifest",
    input: z.object({ domainId: domainIdSchema, yaml: z.string() }),
    output: SaveManifestResultSchema,
  }),

  compileManifest: defineContract({
    channel: "echothink:compile-manifest",
    input: z.object({ domainId: domainIdSchema }),
    output: CompileManifestResultSchema,
  }),

  generateArtifacts: defineContract({
    channel: "echothink:generate-artifacts",
    input: z.object({ domainId: domainIdSchema }),
    output: z.object({ files: z.array(z.string()) }),
  }),

  runValidation: defineContract({
    channel: "echothink:run-validation",
    input: z.object({
      domainId: domainIdSchema,
      gates: z.array(gateIdSchema).optional(),
    }),
    output: validationReportSchema,
  }),

  previewStart: defineContract({
    channel: "echothink:preview-start",
    input: z.object({
      domainId: domainIdSchema,
      personaId: z.string().optional(),
    }),
    output: PreviewStartResultSchema,
  }),

  previewRunProcess: defineContract({
    channel: "echothink:preview-run-process",
    input: z.object({
      domainId: domainIdSchema,
      processId: z.string().min(1),
      input: z.unknown(),
    }),
    output: sdkResponseSchema,
  }),

  previewQuery: defineContract({
    channel: "echothink:preview-query",
    input: z.object({
      domainId: domainIdSchema,
      queryId: z.string().min(1),
      args: z.unknown().optional(),
    }),
    output: z.array(looseRecordSchema),
  }),

  previewExplainPermission: defineContract({
    channel: "echothink:preview-explain-permission",
    input: z.object({
      domainId: domainIdSchema,
      capability: z.string().min(1),
      target: z.string().min(1),
    }),
    output: z.object({ allowed: z.boolean(), reason: z.string() }),
  }),

  previewSetPersona: defineContract({
    channel: "echothink:preview-set-persona",
    input: z.object({
      domainId: domainIdSchema,
      personaId: z.string().min(1),
    }),
    output: z.object({ ok: z.literal(true) }),
  }),

  previewInspect: defineContract({
    channel: "echothink:preview-inspect",
    input: z.object({ domainId: domainIdSchema }),
    output: z.object({
      audit: z.array(looseRecordSchema),
      events: z.array(looseRecordSchema),
    }),
  }),

  previewForceFailure: defineContract({
    channel: "echothink:preview-force-failure",
    input: z.object({
      domainId: domainIdSchema,
      kind: z.enum(["permission", "effect", "runtime"]).nullable(),
    }),
    output: z.object({ ok: z.literal(true) }),
  }),

  uiRegistrySearch: defineContract({
    channel: "echothink:ui-registry-search",
    input: z.object({
      text: z.string().optional(),
      kind: registryComponentKindSchema.optional(),
      surfaceType: surfaceTypeSchema.optional(),
    }),
    output: z.array(registryComponentSchema),
  }),

  uiRegistryList: defineContract({
    channel: "echothink:ui-registry-list",
    input: z.void(),
    output: UiRegistryListSchema,
  }),

  registryList: defineContract({
    channel: "echothink:registry-list",
    input: z.void(),
    output: z.array(registryRecordSchema),
  }),

  registryGet: defineContract({
    channel: "echothink:registry-get",
    input: z.object({ domainId: domainIdSchema }),
    output: registryRecordSchema.nullable(),
  }),

  buildRelease: defineContract({
    channel: "echothink:build-release",
    input: z.object({ domainId: domainIdSchema }),
    output: releaseManifestSchema,
  }),

  promote: defineContract({
    channel: "echothink:promote",
    input: z.object({
      domainId: domainIdSchema,
      to: promotionStateSchema,
      evidence: z.any().optional() as z.ZodType<PromotionEvidence | undefined>,
    }),
    output: registryRecordSchema,
  }),

  recordApproval: defineContract({
    channel: "echothink:record-approval",
    input: z.object({
      domainId: domainIdSchema,
      version: z.string().min(1),
      role: approvalRoleSchema,
      user: z.string().min(1),
    }),
    output: z.object({ ok: z.literal(true) }),
  }),

  harnessRun: defineContract({
    channel: "echothink:harness-run",
    input: z.object({
      domainId: domainIdSchema,
      prompt: z.string().min(1),
      surfaceId: z.string().optional(),
      maxIterations: z.number().int().positive().optional(),
    }),
    output: HarnessRunResultSchema,
  }),
} as const;

export const echothinkClient = createClient(echothinkContracts);
