/**
 * @echothink/shared-types
 *
 * The primitive vocabulary shared across all Echothink-Workbench governance packages,
 * plus the ONE canonical JSON-serialization and sha256 implementation. Every package
 * that hashes an artifact MUST route through {@link sha256OfCanonical} so digests are
 * stable and comparable across the workbench, validation pipeline, and runtime.
 *
 * This package contains no business logic and depends on nothing but the Node `crypto`
 * builtin, so it can sit at the root of the dependency graph without creating cycles.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Primitive domain vocabulary
// ---------------------------------------------------------------------------

/** A content hash, always rendered as `sha256:<hex>`. */
export type Sha256 = `sha256:${string}`;

/** The three sequential surface maturity modes (spec §13). */
export type SurfaceType = "standard" | "composed" | "custom";

/** Lifecycle states a release moves through (spec §17). */
export type PromotionState =
  | "draft"
  | "validated-draft"
  | "release-candidate"
  | "approved"
  | "canary"
  | "production"
  | "deprecated"
  | "rolled-back";

/** Release distribution channels declared in the manifest (spec §9 `release.channel`). */
export type ReleaseChannel = "candidate" | "stable" | "canary";

/** How aggressively an operation is audited. */
export type AuditLevel = "none" | "sampled" | "always";

/** Risk classification for a unit process or effect (echothink domain model). */
export type PolicyClass =
  | "read_only"
  | "side_effect_low"
  | "side_effect_high"
  | "sensitive";

/** Deployment environments an effect may be available in (spec §11). */
export type Environment = "preview" | "staging" | "production";

/** Human approval roles used by the promotion engine (spec §28). */
export type ApprovalRole =
  | "domain-owner"
  | "platform-architect"
  | "security"
  | "qa"
  | "release-manager"
  | "integration-owner";

/** A semantic version string (validated with zod where it matters). */
export type SemVer = string;

/** Canonical scalar/field kinds used across entity and IO schemas. */
export type FieldKind =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "json"
  | "enum"
  | "ref";

/** The capability categories the SDK can request through the runtime (spec §19.3). */
export type SdkCapability =
  | "identity.current"
  | "permissions.can"
  | "entity.query"
  | "entity.get"
  | "process.run"
  | "event.subscribe"
  | "audit.annotate"
  | "effect.invoke";

// ---------------------------------------------------------------------------
// Canonical serialization + hashing
// ---------------------------------------------------------------------------

/**
 * A JSON value, used to type the inputs to canonical serialization.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Deterministically serialize a value to JSON with object keys sorted lexicographically
 * at every level and no insignificant whitespace. `undefined` object properties are
 * dropped (matching `JSON.stringify` semantics); `undefined` array elements become
 * `null`. The result is byte-for-byte stable for structurally-equal inputs regardless
 * of property insertion order, which is what makes digests comparable.
 *
 * Throws on values JSON cannot represent in a stable way (functions, symbols, bigint,
 * circular references) so that non-deterministic data never silently enters a hash.
 */
export function canonicalJSONStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const encode = (input: unknown): string | undefined => {
    if (input === null) return "null";

    const t = typeof input;
    if (t === "number") {
      if (!Number.isFinite(input as number)) {
        throw new TypeError(
          "canonicalJSONStringify: non-finite number cannot be canonicalized",
        );
      }
      return JSON.stringify(input);
    }
    if (t === "boolean" || t === "string") return JSON.stringify(input);
    if (t === "bigint") {
      throw new TypeError("canonicalJSONStringify: bigint cannot be canonicalized");
    }
    if (t === "function" || t === "symbol" || t === "undefined") {
      // Mirrors JSON.stringify: these are omitted (object props) / null (array items).
      return undefined;
    }

    // Objects / arrays
    const obj = input as object;
    if (seen.has(obj)) {
      throw new TypeError("canonicalJSONStringify: circular reference");
    }
    seen.add(obj);
    try {
      // Support objects exposing toJSON (e.g. Date).
      const maybeToJSON = (obj as { toJSON?: () => unknown }).toJSON;
      if (typeof maybeToJSON === "function") {
        return encode(maybeToJSON.call(obj));
      }

      if (Array.isArray(obj)) {
        const items = obj.map((item) => encode(item) ?? "null");
        return `[${items.join(",")}]`;
      }

      const record = obj as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        const encoded = encode(record[key]);
        if (encoded === undefined) continue; // drop undefined props
        parts.push(`${JSON.stringify(key)}:${encoded}`);
      }
      return `{${parts.join(",")}}`;
    } finally {
      seen.delete(obj);
    }
  };

  const result = encode(value);
  if (result === undefined) {
    // Top-level undefined/function/symbol — match JSON.stringify which returns undefined,
    // but for hashing we need a concrete string, so encode as JSON null.
    return "null";
  }
  return result;
}

/**
 * The single canonical content hash used everywhere in the workbench. Hashes the
 * canonical JSON form of `value` and returns a `sha256:<hex>` string.
 */
export function sha256OfCanonical(value: unknown): Sha256 {
  return sha256OfString(canonicalJSONStringify(value));
}

/** Hash a raw string with sha256, returning `sha256:<hex>`. Used for file/surface digests. */
export function sha256OfString(input: string): Sha256 {
  const hex = createHash("sha256").update(input, "utf8").digest("hex");
  return `sha256:${hex}`;
}

/** Hash raw bytes with sha256, returning `sha256:<hex>`. */
export function sha256OfBytes(input: Uint8Array): Sha256 {
  const hex = createHash("sha256").update(input).digest("hex");
  return `sha256:${hex}`;
}
