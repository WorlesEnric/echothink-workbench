import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { AppDomainManifestSchema, type AppDomainManifest } from "./schema.js";

export class ManifestParseError extends Error {
  readonly issues: z.ZodIssue[];

  constructor(issues: z.ZodIssue[], message = "Invalid App-Domain manifest") {
    super(message);
    this.name = "ManifestParseError";
    this.issues = issues;
  }
}

export function parseManifestYaml(yaml: string): { manifest: AppDomainManifest } {
  let parsed: unknown;
  try {
    parsed = parseYaml(yaml);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid YAML";
    throw new ManifestParseError(
      [{ code: z.ZodIssueCode.custom, path: [], message }],
      "Invalid manifest YAML",
    );
  }

  const result = AppDomainManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new ManifestParseError(result.error.issues);
  }

  return { manifest: result.data };
}
