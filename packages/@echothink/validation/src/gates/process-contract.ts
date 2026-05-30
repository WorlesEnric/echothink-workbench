import type {
  NormalizedEntity,
  NormalizedField,
  NormalizedProcess,
  NormalizedTransition,
} from "@echothink/domain-manifest";
import type { Gate, GateFinding } from "../types.js";
import {
  errorFinding,
  gateResult,
} from "./common.js";

export const processContractGate: Gate = {
  id: "process-contract",
  async run(ctx) {
    const findings: GateFinding[] = [];
    const permissions = new Set(ctx.compiled.manifest.permissions.map((permission) => permission.id));
    const entities = ctx.compiled.normalizedEntities;
    const entityNames = new Set(entities.map((entity) => entity.name));
    const entityKeys = new Set(entities.map((entity) => entity.key));
    const events = new Set(Object.keys(ctx.compiled.manifest.events));
    const effects = new Set(Object.keys(ctx.compiled.manifest.effects));
    const processes = new Set(ctx.compiled.normalizedProcesses.map((process) => process.id));

    for (const process of ctx.compiled.normalizedProcesses) {
      if (
        process.requires?.permission &&
        !permissions.has(process.requires.permission)
      ) {
        findings.push(
          errorFinding(
            "PROCESS_PERMISSION_UNKNOWN",
            `Process "${process.id}" requires unknown permission "${process.requires.permission}".`,
          ),
        );
      }

      findings.push(
        ...validateFields(process, "input", process.input, entityNames, entityKeys),
        ...validateFields(process, "output", process.output, entityNames, entityKeys),
      );

      for (const entityName of process.reads) {
        if (!entityNames.has(entityName) && !entityKeys.has(entityName)) {
          findings.push(
            errorFinding(
              "PROCESS_ENTITY_UNKNOWN",
              `Process "${process.id}" reads unknown entity "${entityName}".`,
            ),
          );
        }
      }
      for (const entityName of process.writes) {
        if (!entityNames.has(entityName) && !entityKeys.has(entityName)) {
          findings.push(
            errorFinding(
              "PROCESS_ENTITY_UNKNOWN",
              `Process "${process.id}" writes unknown entity "${entityName}".`,
            ),
          );
        }
      }
      for (const eventId of process.emits) {
        if (!events.has(eventId)) {
          findings.push(
            errorFinding(
              "PROCESS_EVENT_UNKNOWN",
              `Process "${process.id}" emits unknown event "${eventId}".`,
            ),
          );
        }
      }
      for (const effectId of process.effects) {
        if (!effects.has(effectId)) {
          findings.push(
            errorFinding(
              "PROCESS_EFFECT_UNKNOWN",
              `Process "${process.id}" references unknown effect "${effectId}".`,
            ),
          );
        }
      }
      if (process.compensation && !processes.has(process.compensation)) {
        findings.push(
          errorFinding(
            "PROCESS_COMPENSATION_UNKNOWN",
            `Process "${process.id}" compensates with unknown process "${process.compensation}".`,
          ),
        );
      }

      for (const transition of process.transitions) {
        findings.push(...validateTransition(process, transition, entities));
      }
      for (const precondition of process.preconditions) {
        findings.push(...validatePrecondition(process, precondition, entities));
      }
    }

    return gateResult(this.id, findings);
  },
};

function validateFields(
  process: NormalizedProcess,
  label: "input" | "output",
  fields: readonly NormalizedField[],
  entityNames: Set<string>,
  entityKeys: Set<string>,
): GateFinding[] {
  const findings: GateFinding[] = [];
  for (const field of fields) {
    if (
      field.kind === "ref" &&
      field.refEntity &&
      !entityNames.has(field.refEntity) &&
      !entityKeys.has(field.refEntity)
    ) {
      findings.push(
        errorFinding(
          "PROCESS_REF_UNRESOLVED",
          `Process "${process.id}" ${label} field "${field.name}" references unknown entity "${field.refEntity}".`,
        ),
      );
    }
    if (field.kind === "enum" && (field.enumValues ?? []).length === 0) {
      findings.push(
        errorFinding(
          "PROCESS_ENUM_EMPTY",
          `Process "${process.id}" ${label} field "${field.name}" has an empty enum.`,
        ),
      );
    }
  }
  return findings;
}

function validateTransition(
  process: NormalizedProcess,
  transition: NormalizedTransition,
  entities: readonly NormalizedEntity[],
): GateFinding[] {
  const findings: GateFinding[] = [];
  const entity = entities.find(
    (candidate) =>
      candidate.name === transition.entity || candidate.key === transition.entity,
  );
  if (!entity) {
    findings.push(
      errorFinding(
        "PROCESS_TRANSITION_ENTITY_UNKNOWN",
        `Process "${process.id}" transition "${transition.target}" references unknown entity "${transition.entity}".`,
      ),
    );
    return findings;
  }

  const field = entity.fields.find((candidate) => candidate.name === transition.field);
  if (!field) {
    findings.push(
      errorFinding(
        "PROCESS_TRANSITION_FIELD_UNKNOWN",
        `Process "${process.id}" transition "${transition.target}" references unknown field "${transition.field}".`,
      ),
    );
    return findings;
  }
  if (field.kind !== "enum") {
    findings.push(
      errorFinding(
        "PROCESS_TRANSITION_FIELD_NOT_ENUM",
        `Process "${process.id}" transition "${transition.target}" must target an enum field.`,
      ),
    );
    return findings;
  }

  const states = new Set(field.enumValues ?? []);
  const stateMachine = entity.stateMachine;
  if (!stateMachine) {
    findings.push(
      errorFinding(
        "PROCESS_TRANSITION_NO_STATE_MACHINE",
        `Process "${process.id}" transitions "${entity.name}.${field.name}" but the entity has no state machine.`,
      ),
    );
    return findings;
  }

  if (transition.kind === "exact") {
    if (transition.from && !states.has(transition.from)) {
      findings.push(
        errorFinding(
          "PROCESS_TRANSITION_STATE_UNKNOWN",
          `Process "${process.id}" transition from "${transition.from}" is not declared on "${entity.name}".`,
        ),
      );
    }
    if (transition.to && !states.has(transition.to)) {
      findings.push(
        errorFinding(
          "PROCESS_TRANSITION_STATE_UNKNOWN",
          `Process "${process.id}" transition to "${transition.to}" is not declared on "${entity.name}".`,
        ),
      );
    }
    if (
      transition.from &&
      transition.to &&
      !stateMachine.transitions.some(
        (candidate) =>
          candidate.from === transition.from &&
          candidate.to === transition.to &&
          (candidate.via === undefined || candidate.via === process.id),
      )
    ) {
      findings.push(
        errorFinding(
          "PROCESS_TRANSITION_ILLEGAL",
          `Process "${process.id}" transition "${transition.from}" -> "${transition.to}" is not legal in "${entity.name}".`,
        ),
      );
    }
    return findings;
  }

  for (const [inputValue, toState] of Object.entries(transition.mapping)) {
    if (!states.has(toState)) {
      findings.push(
        errorFinding(
          "PROCESS_TRANSITION_STATE_UNKNOWN",
          `Process "${process.id}" input "${inputValue}" maps to unknown state "${toState}".`,
        ),
      );
    }
    if (
      !stateMachine.transitions.some(
        (candidate) =>
          candidate.to === toState &&
          (candidate.via === undefined || candidate.via === process.id),
      )
    ) {
      findings.push(
        errorFinding(
          "PROCESS_TRANSITION_ILLEGAL",
          `Process "${process.id}" input "${inputValue}" maps to state "${toState}" without a legal state-machine transition.`,
        ),
      );
    }
  }
  return findings;
}

function validatePrecondition(
  process: NormalizedProcess,
  precondition: string,
  entities: readonly NormalizedEntity[],
): GateFinding[] {
  const parsed =
    /^([A-Za-z][A-Za-z0-9_-]*)\.([A-Za-z][A-Za-z0-9_]*)\s+(?:in\s+\[([^\]]*)\]|==\s*(.+))$/.exec(
      precondition,
    );
  if (!parsed) {
    return [];
  }
  const entityName = parsed[1] ?? "";
  const fieldName = parsed[2] ?? "";
  const entity = entities.find(
    (candidate) => candidate.name === entityName || candidate.key === entityName,
  );
  if (!entity) {
    return [
      errorFinding(
        "PROCESS_PRECONDITION_ENTITY_UNKNOWN",
        `Process "${process.id}" precondition references unknown entity "${entityName}".`,
      ),
    ];
  }
  if (!entity.fields.some((field) => field.name === fieldName)) {
    return [
      errorFinding(
        "PROCESS_PRECONDITION_FIELD_UNKNOWN",
        `Process "${process.id}" precondition references unknown field "${entityName}.${fieldName}".`,
      ),
    ];
  }
  return [];
}
