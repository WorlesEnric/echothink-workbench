import ts from "typescript";
import type { SurfaceRegistration } from "@echothink/domain-manifest";
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

export const securityImportsGate: Gate = {
  id: "security-imports",
  async run(ctx) {
    const findings: GateFinding[] = [];
    for (const file of composedOrCustomSurfaceFiles(ctx.domainDir).filter(
      isSurfaceSourceFile,
    )) {
      const sourceText = readUtf8(file);
      const sourceFile = ts.createSourceFile(
        file,
        sourceText,
        ts.ScriptTarget.ES2022,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const surface = surfaceForFile(ctx.domainDir, ctx.surfaces, file);
      findings.push(
        ...scanSecurityPatterns(
          ctx.domainDir,
          file,
          sourceFile,
          surface,
        ),
      );
    }
    return gateResult(this.id, findings);
  },
};

function scanSecurityPatterns(
  domainDir: string,
  file: string,
  sourceFile: ts.SourceFile,
  surface: SurfaceRegistration | undefined,
): GateFinding[] {
  const findings: GateFinding[] = [];
  const add = (code: string, message: string, node: ts.Node): void => {
    const position = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    findings.push(
      errorFinding(code, message, {
        file: relativeFile(domainDir, file),
        line: position.line + 1,
      }),
    );
  };
  const scanImport = (specifier: string, node: ts.Node): void => {
    const forbiddenImport = forbiddenImportCode(specifier);
    if (forbiddenImport) {
      add(
        forbiddenImport,
        `Forbidden frontend import "${specifier}".`,
        node,
      );
      return;
    }
    if (
      !isRelativeImport(specifier) &&
      !isImportAllowed(specifier, surface?.allowedImports ?? [])
    ) {
      add(
        "ILLEGAL_IMPORT",
        `Import "${specifier}" is not listed in surface allowedImports for "${surface?.id ?? "unknown"}".`,
        node,
      );
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      scanImport(node.moduleSpecifier.text, node.moduleSpecifier);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      scanImport(node.arguments[0].text, node.arguments[0]);
    }
    if (ts.isCallExpression(node)) {
      if (isIdentifierCall(node, "fetch")) {
        add("FORBIDDEN_FETCH", "Generated frontend code must not call fetch().", node.expression);
      }
      if (isAxiosCall(node)) {
        add("FORBIDDEN_AXIOS", "Generated frontend code must not call axios.", node.expression);
      }
      if (isIdentifierCall(node, "eval")) {
        add("FORBIDDEN_EVAL", "Generated frontend code must not call eval().", node.expression);
      }
      if (isLocalStorageTokenWrite(node)) {
        add(
          "FORBIDDEN_TOKEN_STORAGE",
          "Generated frontend code must not write token values to localStorage.",
          node.expression,
        );
      }
    }
    if (ts.isNewExpression(node)) {
      if (node.expression && isIdentifier(node.expression, "WebSocket")) {
        add(
          "FORBIDDEN_WEBSOCKET",
          "Generated frontend code must not create raw WebSocket connections.",
          node.expression,
        );
      }
      if (node.expression && isIdentifier(node.expression, "EventSource")) {
        add(
          "FORBIDDEN_EVENTSOURCE",
          "Generated frontend code must not create raw EventSource connections.",
          node.expression,
        );
      }
      if (node.expression && isIdentifier(node.expression, "Function")) {
        add(
          "FORBIDDEN_FUNCTION_CONSTRUCTOR",
          "Generated frontend code must not construct functions from strings.",
          node.expression,
        );
      }
    }
    if (ts.isPropertyAccessExpression(node) && isProcessEnvAccess(node)) {
      add(
        "FORBIDDEN_PROCESS_ENV",
        "Generated frontend code must not read process.env.",
        node,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function forbiddenImportCode(specifier: string): string | undefined {
  const packageName = packageNameFor(specifier);
  if (
    packageName === "@prisma/client" ||
    packageName === "@supabase/supabase-js" ||
    specifier === "node:fs" ||
    specifier === "fs"
  ) {
    return "FORBIDDEN_IMPORT";
  }
  return undefined;
}

function isIdentifier(node: ts.Node, name: string): node is ts.Identifier {
  return ts.isIdentifier(node) && node.text === name;
}

function isIdentifierCall(node: ts.CallExpression, name: string): boolean {
  return isIdentifier(node.expression, name);
}

function isAxiosCall(node: ts.CallExpression): boolean {
  if (isIdentifier(node.expression, "axios")) {
    return true;
  }
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    isIdentifier(node.expression.expression, "axios")
  );
}

function isLocalStorageTokenWrite(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  if (node.expression.name.text !== "setItem") {
    return false;
  }
  const receiver = node.expression.expression;
  const isLocalStorage =
    isIdentifier(receiver, "localStorage") ||
    (ts.isPropertyAccessExpression(receiver) &&
      receiver.name.text === "localStorage");
  if (!isLocalStorage) {
    return false;
  }
  const firstArg = node.arguments[0];
  return firstArg !== undefined && ts.isStringLiteral(firstArg) && firstArg.text === "token";
}

function isProcessEnvAccess(node: ts.PropertyAccessExpression): boolean {
  return isIdentifier(node.expression, "process") && node.name.text === "env";
}
