import { readFileSync } from "node:fs";
import { join } from "node:path";

import { generateDomain, writeDomain } from "./factory.js";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const [command, domainDir] = argv;
  if (command !== "generate:domain" || !domainDir) {
    throw new Error("Usage: generate:domain <domainDir>");
  }

  const manifestYaml = readFileSync(join(domainDir, "domain.manifest.yaml"), "utf8");
  const result = generateDomain(manifestYaml, {
    now: new Date().toISOString(),
    gitCommit: process.env.GIT_COMMIT,
  });
  writeDomain(domainDir, result);
}
