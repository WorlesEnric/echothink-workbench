export {
  AppDomainManifestSchema,
  EffectDefSchema,
  EntitySchema,
  EventDefSchema,
  FieldSpecSchema,
  IoFieldSpecSchema,
  PermissionSchema,
  PersonaSchema,
  QuerySchema,
  ReleaseSpecSchema,
  RoleSchema,
  SurfaceSchema,
  UnitProcessSchema,
} from "./schema.js";
export type {
  AppDomainManifest,
  EffectDef,
  Entity,
  EventDef,
  FieldSpec,
  IoFieldSpec,
  Permission,
  Persona,
  Query,
  ReleaseSpec,
  Role,
  Surface,
  UnitProcess,
} from "./schema.js";
export { ManifestParseError, parseManifestYaml } from "./parse.js";
export {
  normalizeEntities,
  normalizeEntity,
  normalizeField,
  normalizeFields,
  normalizeProcess,
  normalizeProcesses,
  normalizeTransition,
} from "./normalizers.js";
export { validateManifestSemantics } from "./semantics.js";
export { compileManifest } from "./compile.js";
export { generateKernel } from "./codegen.js";
export type {
  CapabilityMap,
  CompiledManifest,
  CompileOptions,
  GeneratedFile,
  NormalizedEntity,
  NormalizedField,
  NormalizedProcess,
  NormalizedTransition,
  PermissionCapability,
  PermissionMatrixRow,
  SemanticDiagnostic,
  SurfaceRegistration,
} from "./types.js";
