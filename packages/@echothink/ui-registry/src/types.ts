import type { SurfaceType } from "@echothink/shared-types";
import type {
  CompiledManifest,
  GeneratedFile,
  NormalizedEntity,
  SurfaceRegistration,
} from "@echothink/domain-manifest";

export type RegistryComponentKind =
  | "primitive"
  | "block"
  | "page-template"
  | "recipe";

export type RegistryDataBinding = "entityQuery" | "unitProcess" | "event";

export type RegistryAllowedAction =
  | "process.run"
  | "entity.query"
  | "event.subscribe";

export interface RegistryComponent {
  id: string;
  package: string;
  import: string;
  kind: RegistryComponentKind;
  surfaceTypes: SurfaceType[];
  requiredProps?: string[];
  dataBindings?: RegistryDataBinding[];
  allowedActions?: RegistryAllowedAction[];
  examples?: string[];
  validation?: { storybookRequired?: boolean; a11yLevel?: "A" | "AA" | "AAA" };
  description?: string;
}

export interface SurfaceTemplate {
  id: string;
  component: string;
  requires: { query?: boolean; processes?: number };
  render(ctx: StandardSurfaceContext): GeneratedFile[];
}

export interface RegistryRecipe {
  id: string;
  title: string;
  description: string;
  surfaceType: SurfaceType;
  components: string[];
  sdkHooks: string[];
  exampleRef?: string;
}

export interface StandardSurfaceContext {
  compiled: CompiledManifest;
  surface: SurfaceRegistration;
  entity?: NormalizedEntity;
  query?: CompiledManifest["manifest"]["queries"][string];
}

export interface ComponentImport {
  package: string;
  import: string;
}
