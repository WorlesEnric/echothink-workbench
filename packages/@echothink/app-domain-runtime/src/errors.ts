import type { SdkError } from "@echothink/app-domain-sdk";

export class RuntimeSdkError extends Error {
  readonly sdkError: SdkError;

  constructor(error: SdkError) {
    super(error.message);
    this.name = "RuntimeSdkError";
    this.sdkError = error;
  }
}

export function sdkError(
  kind: SdkError["kind"],
  message: string,
  details?: unknown,
): RuntimeSdkError {
  return new RuntimeSdkError({
    kind,
    message,
    ...(details !== undefined ? { details } : {}),
  });
}

export function toSdkError(error: unknown): SdkError {
  if (error instanceof RuntimeSdkError) {
    return error.sdkError;
  }

  if (error instanceof Error) {
    return {
      kind: "runtime",
      message: error.message,
    };
  }

  return {
    kind: "runtime",
    message: "Unknown runtime failure",
    details: error,
  };
}
