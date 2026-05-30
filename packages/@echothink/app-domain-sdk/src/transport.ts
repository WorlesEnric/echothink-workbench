import type { Sha256, SdkCapability } from "@echothink/shared-types";

export interface SdkRequest {
  domainId: string;
  manifestVersion: string;
  surfaceId: string;
  surfaceDigest?: Sha256;
  actorId: string;
  tenantId: string;
  capability: SdkCapability;
  target?: string;
  input?: unknown;
  idempotencyKey?: string;
}

export interface SdkError {
  kind:
    | "permission_denied"
    | "validation"
    | "not_found"
    | "invalid_transition"
    | "effect_denied"
    | "release_guard"
    | "runtime";
  message: string;
  details?: unknown;
}

export type SdkResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: SdkError };

export interface Transport {
  call(req: SdkRequest): Promise<SdkResponse>;
}

export class SdkCallError extends Error {
  readonly error: SdkError;
  readonly kind: SdkError["kind"];
  readonly details: unknown;

  constructor(error: SdkError) {
    super(error.message);
    this.name = "SdkCallError";
    this.error = error;
    this.kind = error.kind;
    this.details = error.details;
  }
}

export interface EventSubscriptionHandle {
  unsubscribe(): void | Promise<void>;
}
