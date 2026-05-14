import ts from "typescript";

export type DiCallKind = "defineContext" | "defineConfig" | "bean" | "provide";

export interface DiCall {
  readonly kind: DiCallKind;
  readonly node: ts.CallExpression;
}

export interface ParsedDiFile {
  readonly sourceFile: ts.SourceFile;
  readonly calls: readonly DiCall[];
}

/**
 * Parse a `.di.ts` file and locate every `defineContext` / `defineConfig` /
 * `bean` / `provide` call by symbol identity.
 *
 * Resolves the called symbol through the type checker so aliased imports work:
 *
 *   import { bean as b } from "clean-di";   // still matched as "bean"
 *
 * Throws if `filePath` is not in the supplied program.
 */
export function parseDiFile(program: ts.Program, filePath: string): ParsedDiFile {
  const sourceFile = program.getSourceFile(filePath);
  if (sourceFile === undefined) {
    throw new Error(`parseDiFile: source file not found in program: ${filePath}`);
  }

  const checker = program.getTypeChecker();
  const calls: DiCall[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const kind = classifyCall(checker, node);
      if (kind !== null) {
        calls.push({ kind, node });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { sourceFile, calls };
}

/**
 * Return the `DiCallKind` of a call expression by resolving its target symbol
 * through the checker and comparing the declaration file path against the
 * expected `clean-di/...` shape. Returns null if the call isn't a clean-di DSL
 * function.
 */
function classifyCall(checker: ts.TypeChecker, call: ts.CallExpression): DiCallKind | null {
  const symbol = checker.getSymbolAtLocation(call.expression);
  if (symbol === undefined) {
    return null;
  }

  // Follow aliases (e.g., `import { bean as b }`).
  const target =
    (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;

  const decl = target.valueDeclaration ?? target.declarations?.[0];
  if (decl === undefined) {
    return null;
  }

  const declFile = decl.getSourceFile().fileName;
  // Match files inside the clean-di package's public DSL surface.
  // Accept both source (during monorepo dev) and dist (when installed).
  if (/clean-di\/(src|dist)\/public\/defineContext\.(ts|d\.ts|js)$/.test(declFile)) {
    return "defineContext";
  }
  if (/clean-di\/(src|dist)\/public\/defineConfig\.(ts|d\.ts|js)$/.test(declFile)) {
    return "defineConfig";
  }
  if (/clean-di\/(src|dist)\/public\/bean\.(ts|d\.ts|js)$/.test(declFile)) {
    return "bean";
  }
  if (/clean-di\/(src|dist)\/public\/provide\.(ts|d\.ts|js)$/.test(declFile)) {
    return "provide";
  }

  return null;
}
