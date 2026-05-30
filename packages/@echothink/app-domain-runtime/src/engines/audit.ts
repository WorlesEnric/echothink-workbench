import type { AuditLevel } from "@echothink/shared-types";

import type { AuditRecord, AuditSink } from "../adapters.js";

export interface AuditEngine {
  append(record: AuditRecord, level?: AuditLevel): Promise<void>;
  redact(input: unknown, paths: readonly string[]): unknown;
}

export class DefaultAuditEngine implements AuditEngine {
  constructor(private readonly sink: AuditSink) {}

  async append(record: AuditRecord, level: AuditLevel = "always"): Promise<void> {
    if (level === "none") {
      return;
    }
    await this.sink.append(record);
  }

  redact(input: unknown, paths: readonly string[]): unknown {
    if (paths.length === 0) {
      return cloneJson(input);
    }

    const cloned = cloneJson(input);
    for (const path of paths) {
      redactPath(cloned, path);
    }
    return cloned;
  }
}

function cloneJson(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function redactPath(value: unknown, path: string): void {
  const parts = path.split(".").filter((part) => part.length > 0);
  if (parts.length === 0) {
    return;
  }

  let cursor: unknown = value;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (!isRecord(cursor)) {
      return;
    }
    const next = cursor[parts[index] ?? ""];
    if (next === undefined) {
      return;
    }
    cursor = next;
  }

  if (!isRecord(cursor)) {
    return;
  }
  const last = parts[parts.length - 1];
  if (last !== undefined && Object.prototype.hasOwnProperty.call(cursor, last)) {
    cursor[last] = "[REDACTED]";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
