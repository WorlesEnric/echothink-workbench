import type { NormalizedEntity } from "@echothink/domain-manifest";

export interface StateMachineEvaluator {
  isLegalTransition(
    entity: NormalizedEntity,
    field: string,
    from: unknown,
    to: unknown,
  ): boolean;
}

export class DefaultStateMachineEvaluator implements StateMachineEvaluator {
  isLegalTransition(
    entity: NormalizedEntity,
    field: string,
    from: unknown,
    to: unknown,
  ): boolean {
    if (!entity.stateMachine || entity.stateField !== field) {
      return true;
    }
    if (typeof from !== "string" || typeof to !== "string") {
      return false;
    }
    return entity.stateMachine.transitions.some(
      (transition) => transition.from === from && transition.to === to,
    );
  }
}
