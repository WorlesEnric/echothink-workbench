import {
  AppDomainManifestSchema,
  RoleSchema,
  type CompiledManifest,
} from "@echothink/domain-manifest";
import {
  sha256OfCanonical,
  sha256OfString,
  type ApprovalRole,
  type SemVer,
  type Sha256,
} from "@echothink/shared-types";

export interface ReleaseApproval {
  role: ApprovalRole;
  user: string;
  timestamp: string;
}

export interface ReleaseManifest {
  domainId: string;
  version: SemVer;
  gitCommit: string;
  manifestDigest: Sha256;
  surfaceDigests: Record<string, Sha256>;
  sdkContractVersion: string;
  runtimeCompatibility: string;
  effects?: Record<string, string>;
  validationReport: string;
  approvals: ReleaseApproval[];
  rollback?: {
    previousVersion?: SemVer;
    safeRollback: boolean;
  };
  signature?: string;
}

export type UnsignedReleaseManifest = Omit<ReleaseManifest, "signature">;

export type ReleaseManifestSafeParseResult =
  | { success: true; data: ReleaseManifest }
  | { success: false; error: unknown };

export interface ReleaseManifestSchemaApi {
  parse(input: unknown): ReleaseManifest;
  safeParse(input: unknown): ReleaseManifestSafeParseResult;
}

const EmptyObjectSchema = AppDomainManifestSchema.pick({});
const MetadataSchema = AppDomainManifestSchema.shape.metadata;
const StringSchema = MetadataSchema.shape.name;
const SemVerSchema = MetadataSchema.shape.version;
const BooleanSchema = RoleSchema.shape.assignable.unwrap();

const Sha256Schema = StringSchema
  .regex(/^sha256:[a-f0-9]{64}$/)
  .transform((value) => value as Sha256);

const APPROVAL_ROLES = [
  "domain-owner",
  "platform-architect",
  "security",
  "qa",
  "release-manager",
  "integration-owner",
] as const satisfies readonly ApprovalRole[];

const ApprovalRoleSchema = StringSchema.refine(
  (value): value is ApprovalRole =>
    APPROVAL_ROLES.includes(value as ApprovalRole),
  "must be a known approval role",
);

const StringRecordSchema = EmptyObjectSchema.catchall(StringSchema);
const Sha256RecordSchema = EmptyObjectSchema.catchall(Sha256Schema);

const ReleaseManifestObjectSchema = EmptyObjectSchema.extend({
  domainId: StringSchema.min(1),
  version: SemVerSchema,
  gitCommit: StringSchema.min(1),
  manifestDigest: Sha256Schema,
  surfaceDigests: Sha256RecordSchema,
  sdkContractVersion: StringSchema.min(1),
  runtimeCompatibility: StringSchema.min(1),
  effects: StringRecordSchema.optional(),
  validationReport: StringSchema.min(1),
  approvals: EmptyObjectSchema.extend({
    role: ApprovalRoleSchema,
    user: StringSchema.min(1),
    timestamp: StringSchema.min(1),
  })
    .strict()
    .array(),
  rollback: EmptyObjectSchema.extend({
    previousVersion: SemVerSchema.optional(),
    safeRollback: BooleanSchema,
  })
    .strict()
    .optional(),
  signature: StringSchema.min(1).optional(),
})
  .strict();

const UnsignedReleaseManifestSchema = ReleaseManifestObjectSchema.omit({
  signature: true,
});

export const ReleaseManifestSchema: ReleaseManifestSchemaApi =
  ReleaseManifestObjectSchema;

export interface BuildReleaseManifestInput {
  compiled: CompiledManifest;
  gitCommit: string;
  surfaceFiles: Record<string, string>;
  sdkContractVersion: string;
  runtimeCompatibility: string;
  validationReport: string;
  effects?: Record<string, string>;
  previousVersion?: SemVer;
}

export function buildReleaseManifest(
  input: BuildReleaseManifestInput,
): ReleaseManifest {
  const surfaceDigests = Object.fromEntries(
    Object.entries(input.surfaceFiles)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([surfaceId, contents]) => [surfaceId, sha256OfString(contents)]),
  );

  return ReleaseManifestSchema.parse({
    domainId: input.compiled.manifest.metadata.id,
    version: input.compiled.manifest.metadata.version,
    gitCommit: input.gitCommit,
    manifestDigest: input.compiled.manifestDigest,
    surfaceDigests,
    sdkContractVersion: input.sdkContractVersion,
    runtimeCompatibility: input.runtimeCompatibility,
    ...(input.effects ? { effects: sortedRecord(input.effects) } : {}),
    validationReport: input.validationReport,
    approvals: [],
    ...(input.previousVersion
      ? {
          rollback: {
            previousVersion: input.previousVersion,
            safeRollback: true,
          },
        }
      : {}),
  });
}

export function unsignedReleaseManifest(
  release: ReleaseManifest,
): UnsignedReleaseManifest {
  return UnsignedReleaseManifestSchema.parse({
    domainId: release.domainId,
    version: release.version,
    gitCommit: release.gitCommit,
    manifestDigest: release.manifestDigest,
    surfaceDigests: release.surfaceDigests,
    sdkContractVersion: release.sdkContractVersion,
    runtimeCompatibility: release.runtimeCompatibility,
    ...(release.effects ? { effects: release.effects } : {}),
    validationReport: release.validationReport,
    approvals: release.approvals,
    ...(release.rollback ? { rollback: release.rollback } : {}),
  });
}

export function computeCompiledManifestDigest(
  compiled: CompiledManifest,
): Sha256 {
  return sha256OfCanonical({
    manifest: compiled.manifest,
    normalizedEntities: compiled.normalizedEntities,
    normalizedProcesses: compiled.normalizedProcesses,
    permissionMatrix: compiled.permissionMatrix,
    capabilityMap: compiled.capabilityMap,
    surfaceRegistrations: compiled.surfaceRegistrations,
  });
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}
