import type { Gate, GateId } from "../types.js";
import { accessibilityGate } from "./accessibility.js";
import { buildGate } from "./build.js";
import { dependencyAllowlistGate } from "./dependency-allowlist.js";
import { effectSimulationGate } from "./effect-simulation.js";
import { entityContractGate } from "./entity-contract.js";
import { manifestSchemaGate } from "./manifest-schema.js";
import { manifestSemanticGate } from "./manifest-semantic.js";
import { permissionSimulationGate } from "./permission-simulation.js";
import { processContractGate } from "./process-contract.js";
import { releaseCompletenessGate } from "./release-completeness.js";
import { securityImportsGate } from "./security-imports.js";
import { storybookGate } from "./storybook.js";
import { typescriptGate } from "./typescript.js";
import { visualGate } from "./visual.js";

export { accessibilityGate } from "./accessibility.js";
export { buildGate } from "./build.js";
export { dependencyAllowlistGate } from "./dependency-allowlist.js";
export { effectSimulationGate } from "./effect-simulation.js";
export { entityContractGate } from "./entity-contract.js";
export { manifestSchemaGate } from "./manifest-schema.js";
export { manifestSemanticGate } from "./manifest-semantic.js";
export { permissionSimulationGate } from "./permission-simulation.js";
export { processContractGate } from "./process-contract.js";
export { releaseCompletenessGate } from "./release-completeness.js";
export { securityImportsGate } from "./security-imports.js";
export { storybookGate } from "./storybook.js";
export { typescriptGate } from "./typescript.js";
export { visualGate } from "./visual.js";

export const allGates = [
  manifestSchemaGate,
  manifestSemanticGate,
  typescriptGate,
  buildGate,
  permissionSimulationGate,
  entityContractGate,
  processContractGate,
  securityImportsGate,
  dependencyAllowlistGate,
  effectSimulationGate,
  storybookGate,
  accessibilityGate,
  visualGate,
  releaseCompletenessGate,
] as const satisfies readonly Gate[];

export const gatesById: ReadonlyMap<GateId, Gate> = new Map(
  allGates.map((gate) => [gate.id, gate]),
);
