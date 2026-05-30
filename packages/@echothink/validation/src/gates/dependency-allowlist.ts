import ts from "typescript";
import type { Gate, GateFinding } from "../types.js";
import {
  composedOrCustomSurfaceFiles,
  errorFinding,
  gateResult,
  isImportAllowed,
  isSurfaceSourceFile,
  isRelativeImport,
  packageNameFor,
  readUtf8,
  relativeFile,
  surfaceForFile,
} from "./common.js";

const BASE_ALLOWLIST = [
  "react",
  "@echothink/app-domain-sdk",
  "@echothink-ui/*",
  "@tanstack/react-query",
  "@tanstack/react-router",
  "zod",
  "date-fns",
] as const;

export const dependencyAllowlistGate: Gate = {
  id: "dependency-allowlist",
  async run(ctx) {
    const findings: GateFinding[] = [];
    for (const file of composedOrCustomSurfaceFiles(ctx.domainDir).filter(
      isSurfaceSourceFile,
    )) {
      const sourceFile = ts.createSourceFile(
        file,
        readUtf8(file),
        ts.ScriptTarget.ES2022,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const surface = surfaceForFile(ctx.domainDir, ctx.surfaces, file);
      const allowed = [...BASE_ALLOWLIST, ...(surface?.allowedImports ?? [])];
      const visit = (node: ts.Node): void => {
        const specifier = importSpecifier(node);
        if (specifier && !isRelativeImport(specifier)) {
          const packageName = packageNameFor(specifier);
          if (!isImportAllowed(packageName, allowed) && !isImportAllowed(specifier, allowed)) {
            const position = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(sourceFile),
            );
            findings.push(
              errorFinding(
                "DEPENDENCY_NOT_ALLOWED",
                `Dependency "${packageName}" from import "${specifier}" is not allowed for surface "${surface?.id ?? "unknown"}".`,
                {
                  file: relativeFile(ctx.domainDir, file),
                  line: position.line + 1,
                },
              ),
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    return gateResult(this.id, findings);
  },
};

function importSpecifier(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length === 1 &&
    node.arguments[0] !== undefined &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return undefined;
}
