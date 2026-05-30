export { components } from "./catalog.js";
export {
  find,
  getComponentImportsForSurface,
  search,
  uiRegistry,
  uiRegistryVersion,
  type RegistrySearchInput,
  type RegistrySearchQuery,
} from "./registry.js";
export { recipes } from "./recipes.js";
export * from "./templates/index.js";
export type {
  ComponentImport,
  RegistryAllowedAction,
  RegistryComponent,
  RegistryComponentKind,
  RegistryDataBinding,
  RegistryRecipe,
  StandardSurfaceContext,
  SurfaceTemplate,
} from "./types.js";
