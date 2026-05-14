import ts from "typescript";

import type { Diagnostic } from "../diagnostics/codes.js";

import type { ContextDeclaration } from "./collectContexts.js";

export interface BeanScopeEntry {
  /** Bean name in the local context. */
  readonly name: string;
  /** Whether the bean was declared via `bean(...)` or `provide(...)`. */
  readonly kind: "bean" | "provide";
  /** The class declaration referenced by `bean(Class)`, if resolvable. */
  readonly classDeclaration: ts.ClassDeclaration | undefined;
  /** The class symbol, useful for type comparisons later. */
  readonly classSymbol: ts.Symbol | undefined;
  /** For `provide(...)`, the result type of the factory expression. */
  readonly provideType: ts.Type | undefined;
  /** `bean(Class, overrides)` second argument, if present. Keys = param names. */
  readonly overrides: Readonly<Record<string, string>>;
  /** Original AST node (the `bean()` or `provide()` call) — for diagnostics positions. */
  readonly source: ts.CallExpression;
  /** True when the entry came from an imported `defineConfig(...)`. */
  readonly imported: boolean;
}

/** A bean scope keyed by bean name. */
export type BeanScope = ReadonlyMap<string, BeanScopeEntry>;

/** Result of building a scope with imports. */
export interface BuildBeanScopeResult {
  readonly scope: BeanScope;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Build the bean scope for a single context, walking `imports: [...]` transitively
 * and deduplicating by `defineConfig` call AST node identity (diamond imports —
 * DESIGN §5.5). Emits `CDI-010` when an `imports` entry is not a `defineConfig`
 * result, and `CDI-006` when a local bean name collides with an imported one.
 *
 * The returned map preserves insertion order: imported beans are merged first
 * (in `imports` order, with transitive imports flattened depth-first), then
 * local beans on top.
 */
export function buildBeanScopeWithImports(
  checker: ts.TypeChecker,
  context: ContextDeclaration,
): BuildBeanScopeResult {
  const diagnostics: Diagnostic[] = [];
  const scope = new Map<string, BeanScopeEntry>();
  const visitedConfigs = new Set<ts.CallExpression>();

  // 1) Merge imported beans first (so local beans win on collision and can emit CDI-006).
  for (const importExpr of context.imports) {
    walkImport(checker, importExpr, scope, visitedConfigs, diagnostics);
  }

  // 2) Merge local beans, emitting CDI-006 on collision with imported entries.
  for (const beanDecl of context.beans) {
    const existing = scope.get(beanDecl.name);
    if (existing !== undefined && existing.imported) {
      const source = beanDecl.callExpression.getSourceFile();
      const { line, character } = source.getLineAndCharacterOfPosition(
        beanDecl.callExpression.getStart(),
      );
      diagnostics.push({
        code: "CDI-006",
        file: source.fileName,
        line: line + 1,
        column: character + 1,
        message: `DuplicateBean: the bean '${beanDecl.name}' is declared locally and also pulled in via imports.`,
        hint: "Rename one of the conflicting beans.",
      });
      // Skip the local entry — keep the imported one; the diagnostic is the
      // build-time signal. (Either choice fails the build via the reporter.)
      continue;
    }

    const entry = buildEntry(checker, beanDecl.name, beanDecl, /* imported */ false);
    scope.set(beanDecl.name, entry);
  }

  return { scope, diagnostics };
}

/**
 * Legacy single-context scope builder (locals only). Retained as a thin alias
 * over `buildBeanScopeWithImports` so existing W3 callers and tests continue to
 * work. Imports-resolution diagnostics are silently dropped here; callers that
 * need them must use `buildBeanScopeWithImports`.
 */
export function buildBeanScope(checker: ts.TypeChecker, context: ContextDeclaration): BeanScope {
  return buildBeanScopeWithImports(checker, context).scope;
}

function walkImport(
  checker: ts.TypeChecker,
  importExpr: ts.Expression,
  scope: Map<string, BeanScopeEntry>,
  visitedConfigs: Set<ts.CallExpression>,
  diagnostics: Diagnostic[],
): void {
  const configCall = resolveDefineConfigCall(checker, importExpr);
  if (configCall === null) {
    const source = importExpr.getSourceFile();
    const { line, character } = source.getLineAndCharacterOfPosition(importExpr.getStart());
    diagnostics.push({
      code: "CDI-010",
      file: source.fileName,
      line: line + 1,
      column: character + 1,
      message: "InvalidImport: `imports` entry is not a `defineConfig(...)` result.",
      hint: "Pass the result of `defineConfig({...})`, not a raw object or `bean(...)` call.",
    });

    return;
  }

  // Diamond dedup — same defineConfig reached via two paths.
  if (visitedConfigs.has(configCall)) {
    return;
  }
  visitedConfigs.add(configCall);

  const spec = configCall.arguments[0];
  if (spec === undefined || !ts.isObjectLiteralExpression(spec)) {
    return;
  }

  // Recurse into the imported spec's own `imports` first (depth-first),
  // matching the parent's "imports merged before locals" ordering.
  for (const nestedImport of extractImports(spec)) {
    walkImport(checker, nestedImport, scope, visitedConfigs, diagnostics);
  }

  // Merge this config's own beans.
  for (const beanDecl of extractBeansFromSpec(spec)) {
    if (scope.has(beanDecl.name)) {
      // Already in scope via another imported config — same-name collisions
      // between two distinct imports are not addressed at MVP scope; we keep
      // the first occurrence. (T-053 / future work can tighten this.)
      continue;
    }
    const entry = buildEntry(checker, beanDecl.name, beanDecl, /* imported */ true);
    scope.set(beanDecl.name, entry);
  }
}

/**
 * Resolve an `imports: [...]` expression to the underlying `defineConfig(...)`
 * call AST node. Returns null if the expression cannot be traced to one
 * (→ CDI-010).
 *
 * Accepted forms:
 *   - identifier referencing a `const x = defineConfig({...})` declaration
 *   - inline `defineConfig({...})` call
 *   - `export const x = defineConfig({...})` re-exported and imported by alias
 */
function resolveDefineConfigCall(
  checker: ts.TypeChecker,
  expr: ts.Expression,
): ts.CallExpression | null {
  // Direct call form: `imports: [defineConfig({...})]`
  if (ts.isCallExpression(expr) && isDefineConfigCallee(checker, expr)) {
    return expr;
  }

  // Identifier form: `imports: [commentsConfig]` — chase the declaration.
  if (ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr)) {
    const symbol = checker.getSymbolAtLocation(expr);
    if (symbol === undefined) {
      return null;
    }
    const target =
      (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;

    const decls = target.declarations ?? [];
    for (const decl of decls) {
      if (!ts.isVariableDeclaration(decl)) continue;
      const initializer = decl.initializer;
      if (initializer === undefined) continue;
      if (ts.isCallExpression(initializer) && isDefineConfigCallee(checker, initializer)) {
        return initializer;
      }
    }
  }

  return null;
}

function isDefineConfigCallee(checker: ts.TypeChecker, call: ts.CallExpression): boolean {
  const symbol = checker.getSymbolAtLocation(call.expression);
  if (symbol === undefined) {
    return false;
  }
  const target =
    (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;

  const decl = target.valueDeclaration ?? target.declarations?.[0];
  if (decl === undefined) {
    return false;
  }

  const declFile = decl.getSourceFile().fileName;

  return /clean-di\/(src|dist)\/public\/defineConfig\.(ts|d\.ts|js)$/.test(declFile);
}

/**
 * Extract bean declarations from a `defineConfig`/`defineContext` spec object
 * literal. Mirrors `collectContexts.extractBeans` but operates on the spec we
 * already have at hand (we don't re-run the full `collectContexts` pipeline on
 * imported files because it's overkill — the spec literal is right here).
 */
interface SpecBeanDeclaration {
  readonly name: string;
  readonly callExpression: ts.CallExpression;
  readonly kind: "bean" | "provide";
}

function extractBeansFromSpec(spec: ts.ObjectLiteralExpression): readonly SpecBeanDeclaration[] {
  const beans: SpecBeanDeclaration[] = [];

  for (const prop of spec.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (prop.name === undefined) continue;
    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;
    if (prop.name.text !== "beans") continue;
    if (!ts.isObjectLiteralExpression(prop.initializer)) continue;

    for (const beanProp of prop.initializer.properties) {
      if (!ts.isPropertyAssignment(beanProp)) continue;
      if (beanProp.name === undefined) continue;
      if (!ts.isIdentifier(beanProp.name) && !ts.isStringLiteral(beanProp.name)) continue;

      const beanName = beanProp.name.text;
      const rhs = beanProp.initializer;
      if (!ts.isCallExpression(rhs)) continue;

      const calleeText = rhs.expression.getText();
      const kind: SpecBeanDeclaration["kind"] = calleeText.startsWith("provide")
        ? "provide"
        : "bean";

      beans.push({ name: beanName, callExpression: rhs, kind });
    }
  }

  return beans;
}

function extractImports(spec: ts.ObjectLiteralExpression): readonly ts.Expression[] {
  for (const prop of spec.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (prop.name === undefined) continue;
    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;
    if (prop.name.text !== "imports") continue;
    if (!ts.isArrayLiteralExpression(prop.initializer)) return [];

    return [...prop.initializer.elements];
  }

  return [];
}

function buildEntry(
  checker: ts.TypeChecker,
  name: string,
  beanDecl: { name: string; callExpression: ts.CallExpression; kind: "bean" | "provide" },
  imported: boolean,
): BeanScopeEntry {
  const call = beanDecl.callExpression;

  if (beanDecl.kind === "bean") {
    const classArg = call.arguments[0];
    const overridesArg = call.arguments[1];

    const { classDeclaration, classSymbol } = resolveClassReference(checker, classArg);
    const overrides = extractOverrides(overridesArg);

    return {
      name,
      kind: "bean",
      classDeclaration,
      classSymbol,
      provideType: undefined,
      overrides,
      source: call,
      imported,
    };
  }

  // provide(...) — use the return type of the call itself (which respects the
  // generic on `provide<T>`), NOT the inferred return type of the lambda body.
  // For `provide<string>((cfg) => cfg.x)`, the call returns `string` even
  // though the lambda body's type is `any` (cfg is `any`).
  const provideType = checker.getTypeAtLocation(call);

  return {
    name,
    kind: "provide",
    classDeclaration: undefined,
    classSymbol: undefined,
    provideType,
    overrides: {},
    source: call,
    imported,
  };
}

function resolveClassReference(
  checker: ts.TypeChecker,
  arg: ts.Expression | undefined,
): { classDeclaration: ts.ClassDeclaration | undefined; classSymbol: ts.Symbol | undefined } {
  if (arg === undefined) {
    return { classDeclaration: undefined, classSymbol: undefined };
  }

  const symbol = checker.getSymbolAtLocation(arg);
  if (symbol === undefined) {
    return { classDeclaration: undefined, classSymbol: undefined };
  }

  const target =
    (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;

  const decl = target.valueDeclaration ?? target.declarations?.[0];
  if (decl !== undefined && ts.isClassDeclaration(decl)) {
    return { classDeclaration: decl, classSymbol: target };
  }

  return { classDeclaration: undefined, classSymbol: target };
}

function extractOverrides(arg: ts.Expression | undefined): Record<string, string> {
  if (arg === undefined || !ts.isObjectLiteralExpression(arg)) {
    return {};
  }

  const overrides: Record<string, string> = {};
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (prop.name === undefined) continue;
    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;

    const key = prop.name.text;
    const valueNode = prop.initializer;
    if (ts.isStringLiteral(valueNode) || ts.isNoSubstitutionTemplateLiteral(valueNode)) {
      overrides[key] = valueNode.text;
    }
  }

  return overrides;
}
