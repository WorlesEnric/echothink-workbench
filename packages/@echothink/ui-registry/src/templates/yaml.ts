type YamlScalar = null | boolean | number | string;

export function toStableYaml(value: unknown): string {
  return renderNode(value, 0).join("\n");
}

function renderNode(value: unknown, indent: number): string[] {
  if (isScalar(value)) {
    return [`${spaces(indent)}${renderScalar(value)}`];
  }

  if (Array.isArray(value)) {
    return renderArray(value, indent);
  }

  if (isRecord(value)) {
    return renderObject(value, indent);
  }

  if (value === undefined) {
    return [`${spaces(indent)}null`];
  }

  throw new TypeError(`Unsupported YAML value: ${typeof value}`);
}

function renderObject(record: Record<string, unknown>, indent: number): string[] {
  const lines: string[] = [];
  const entries = sortedEntries(record);
  if (entries.length === 0) {
    return [`${spaces(indent)}{}`];
  }

  for (const [key, value] of entries) {
    if (isCompact(value)) {
      lines.push(`${spaces(indent)}${key}: ${renderCompact(value)}`);
      continue;
    }
    lines.push(`${spaces(indent)}${key}:`);
    lines.push(...renderNode(value, indent + 2));
  }
  return lines;
}

function renderArray(values: unknown[], indent: number): string[] {
  if (values.length === 0) {
    return [`${spaces(indent)}[]`];
  }

  const lines: string[] = [];
  for (const value of values) {
    if (isCompact(value)) {
      lines.push(`${spaces(indent)}- ${renderCompact(value)}`);
      continue;
    }

    if (isRecord(value)) {
      const entries = sortedEntries(value);
      const [firstEntry, ...restEntries] = entries;
      if (!firstEntry) {
        lines.push(`${spaces(indent)}- {}`);
        continue;
      }

      const [firstKey, firstValue] = firstEntry;
      if (isCompact(firstValue)) {
        lines.push(`${spaces(indent)}- ${firstKey}: ${renderCompact(firstValue)}`);
      } else {
        lines.push(`${spaces(indent)}- ${firstKey}:`);
        lines.push(...renderNode(firstValue, indent + 4));
      }

      for (const [key, nestedValue] of restEntries) {
        if (isCompact(nestedValue)) {
          lines.push(
            `${spaces(indent + 2)}${key}: ${renderCompact(nestedValue)}`,
          );
        } else {
          lines.push(`${spaces(indent + 2)}${key}:`);
          lines.push(...renderNode(nestedValue, indent + 4));
        }
      }
      continue;
    }

    lines.push(`${spaces(indent)}-`);
    lines.push(...renderNode(value, indent + 2));
  }
  return lines;
}

function sortedEntries(record: Record<string, unknown>): [string, unknown][] {
  return Object.entries(record)
    .filter((entry): entry is [string, unknown] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
}

function isCompact(value: unknown): boolean {
  if (isScalar(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (isRecord(value)) {
    return sortedEntries(value).length === 0;
  }
  return false;
}

function renderCompact(value: unknown): string {
  if (isScalar(value)) {
    return renderScalar(value);
  }
  if (Array.isArray(value) && value.length === 0) {
    return "[]";
  }
  if (isRecord(value) && sortedEntries(value).length === 0) {
    return "{}";
  }
  throw new TypeError("Non-compact YAML value");
}

function renderScalar(value: YamlScalar): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Non-finite numbers cannot be rendered as YAML");
    }
    return String(value);
  }
  return isPlainString(value) ? value : JSON.stringify(value);
}

function isPlainString(value: string): boolean {
  if (!/^[A-Za-z0-9_./][A-Za-z0-9_./:-]*$/.test(value)) {
    return false;
  }
  if (/^(?:true|false|null|Null|NULL|~)$/u.test(value)) {
    return false;
  }
  return !/^[+-]?(?:\d+|\d+\.\d+)$/u.test(value);
}

function isScalar(value: unknown): value is YamlScalar {
  return (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function spaces(count: number): string {
  return " ".repeat(count);
}
