import { ARRAY_FIELD_KINDS, SCALAR_FIELD_KINDS } from "./constants.js";

export interface ParsedFieldSpecString {
  kind: "scalar" | "array" | "enum";
  type?: (typeof SCALAR_FIELD_KINDS)[number];
  arrayOf?: (typeof ARRAY_FIELD_KINDS)[number];
  enumValues?: string[];
  optional: boolean;
}

export function parseFieldSpecString(
  value: string,
  opts: { allowInlineEnum: boolean },
): ParsedFieldSpecString | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const optional = trimmed.endsWith("?");
  const bare = optional ? trimmed.slice(0, -1).trim() : trimmed;
  if (bare.length === 0) {
    return null;
  }

  const enumMatch = /^enum\((.*)\)$/.exec(bare);
  if (enumMatch) {
    if (!opts.allowInlineEnum) {
      return null;
    }
    const valuesSource = enumMatch[1];
    if (valuesSource === undefined) {
      return null;
    }
    const enumValues = valuesSource
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (enumValues.length === 0) {
      return null;
    }
    return { kind: "enum", enumValues, optional };
  }

  if (isScalarKind(bare)) {
    return { kind: "scalar", type: bare, optional };
  }

  if (bare.endsWith("[]")) {
    const arrayOf = bare.slice(0, -2);
    if (isArrayKind(arrayOf)) {
      return { kind: "array", arrayOf, optional };
    }
  }

  return null;
}

export function isValidFieldSpecString(
  value: string,
  opts: { allowInlineEnum: boolean },
): boolean {
  return parseFieldSpecString(value, opts) !== null;
}

function isScalarKind(value: string): value is (typeof SCALAR_FIELD_KINDS)[number] {
  return SCALAR_FIELD_KINDS.includes(
    value as (typeof SCALAR_FIELD_KINDS)[number],
  );
}

function isArrayKind(value: string): value is (typeof ARRAY_FIELD_KINDS)[number] {
  return ARRAY_FIELD_KINDS.includes(
    value as (typeof ARRAY_FIELD_KINDS)[number],
  );
}
