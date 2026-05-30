import type { NormalizedEntity } from "@echothink/domain-manifest";
import type { Gate, GateFinding } from "../types.js";
import {
  errorFinding,
  gateResult,
} from "./common.js";

export const entityContractGate: Gate = {
  id: "entity-contract",
  async run(ctx) {
    const findings: GateFinding[] = [];
    const entityNames = new Set(ctx.compiled.normalizedEntities.map((entity) => entity.name));
    const entityKeys = new Set(ctx.compiled.normalizedEntities.map((entity) => entity.key));

    for (const entity of ctx.compiled.normalizedEntities) {
      const fieldNames = new Set(entity.fields.map((field) => field.name));
      for (const field of entity.fields) {
        if (
          field.kind === "ref" &&
          field.refEntity &&
          !entityNames.has(field.refEntity) &&
          !entityKeys.has(field.refEntity)
        ) {
          findings.push(
            errorFinding(
              "ENTITY_REF_UNRESOLVED",
              `Entity "${entity.name}" field "${field.name}" references unknown entity "${field.refEntity}".`,
            ),
          );
        }
        if (field.kind === "enum" && (field.enumValues ?? []).length === 0) {
          findings.push(
            errorFinding(
              "ENTITY_ENUM_EMPTY",
              `Entity "${entity.name}" field "${field.name}" has an empty enum.`,
            ),
          );
        }
      }

      for (const [relationshipName, relationship] of Object.entries(
        entity.relationships ?? {},
      )) {
        if (
          !entityNames.has(relationship.entity) &&
          !entityKeys.has(relationship.entity)
        ) {
          findings.push(
            errorFinding(
              "ENTITY_RELATIONSHIP_UNRESOLVED",
              `Entity "${entity.name}" relationship "${relationshipName}" references unknown entity "${relationship.entity}".`,
            ),
          );
        }
      }

      if (entity.stateMachine) {
        findings.push(...validateStateMachine(entity, fieldNames));
      }
    }

    return gateResult(this.id, findings);
  },
};

function validateStateMachine(
  entity: NormalizedEntity,
  fieldNames: Set<string>,
): GateFinding[] {
  const findings: GateFinding[] = [];
  if (!entity.stateField) {
    findings.push(
      errorFinding(
        "ENTITY_STATE_FIELD_MISSING",
        `Entity "${entity.name}" declares a state machine without stateField.`,
      ),
    );
    return findings;
  }
  const stateMachine = entity.stateMachine;
  if (!stateMachine) {
    return findings;
  }
  if (!fieldNames.has(entity.stateField)) {
    findings.push(
      errorFinding(
        "ENTITY_STATE_FIELD_UNKNOWN",
        `Entity "${entity.name}" stateField "${entity.stateField}" is not in its schema.`,
      ),
    );
    return findings;
  }
  const stateField = entity.fields.find((field) => field.name === entity.stateField);
  if (stateField?.kind !== "enum") {
    findings.push(
      errorFinding(
        "ENTITY_STATE_FIELD_NOT_ENUM",
        `Entity "${entity.name}" stateField "${entity.stateField}" must be an enum.`,
      ),
    );
    return findings;
  }

  const states = new Set(stateField.enumValues ?? []);
  if (!states.has(stateMachine.initial)) {
    findings.push(
      errorFinding(
        "ENTITY_STATE_UNKNOWN",
        `Entity "${entity.name}" state machine initial state "${stateMachine.initial}" is not in the state enum.`,
      ),
    );
  }
  for (const transition of stateMachine.transitions) {
    if (!states.has(transition.from)) {
      findings.push(
        errorFinding(
          "ENTITY_STATE_UNKNOWN",
          `Entity "${entity.name}" transition from "${transition.from}" is not in the state enum.`,
        ),
      );
    }
    if (!states.has(transition.to)) {
      findings.push(
        errorFinding(
          "ENTITY_STATE_UNKNOWN",
          `Entity "${entity.name}" transition to "${transition.to}" is not in the state enum.`,
        ),
      );
    }
  }
  return findings;
}
