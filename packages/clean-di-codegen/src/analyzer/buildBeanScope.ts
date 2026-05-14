import ts from "typescript";

import type { ContextDeclaration } from "./collectContexts.js";

export interface BeanScopeEntry {
  /** Bean name in the local context. */
  readonly name: string;
  /** Whether the bean was declared via `bean(...)` or `provide(...)`. */
  readonly kind: "bean" | "provide";
  /** The class declaration referenced by `bean(Class)`, if resolvable. */
  readonly classDeclaration?: ts.ClassDeclaration;
  /** The class symbol, useful for type comparisons later. */
  readonly classSymbol?: ts.Symbol;
  /** For `provide(...)`, the result type of the factory expression. */
  readonly provideType?: ts.Type;
  /** `bean(Class, overrides)` second argument, if present. Keys = param names. */
  readonly overrides: Readonly<Record<string, string>>;
  /** Original AST node (the `bean()` or `provide()` call) — for diagnostics positions. */
  readonly source: ts.CallExpression;
}

/** A bean scope keyed by bean name. */
export type BeanScope = ReadonlyMap<string, BeanScopeEntry>;

/**
 * Build the bean scope for a single context. For W3 MVP this is just the local
 * beans — imports (W4) will pull in entries from imported defineConfig modules.
 *
 * The returned map preserves declaration order via JS Map iteration semantics.
 */
export function buildBeanScope(
  checker: ts.TypeChecker,
  context: ContextDeclaration,
): BeanScope {
  const scope = new Map<string, BeanScopeEntry>();

  for (const beanDecl of context.beans) {
    const entry = buildEntry(checker, beanDecl.name, beanDecl);
    scope.set(beanDecl.name, entry);
  }

  return scope;
}

function buildEntry(
  checker: ts.TypeChecker,
  name: string,
  beanDecl: ContextDeclaration["beans"][number],
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
      overrides,
      source: call,
    };
  }

  // provide(...)
  const factoryArg = call.arguments[0];
  const provideType = factoryArg !== undefined ? extractProvideReturnType(checker, factoryArg) : undefined;

  return {
    name,
    kind: "provide",
    provideType,
    overrides: {},
    source: call,
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

  const target = (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;

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

function extractProvideReturnType(
  checker: ts.TypeChecker,
  factoryArg: ts.Expression,
): ts.Type | undefined {
  // factoryArg is the lambda passed to provide(). We want its return type.
  if (
    ts.isArrowFunction(factoryArg) ||
    ts.isFunctionExpression(factoryArg)
  ) {
    const signature = checker.getSignatureFromDeclaration(factoryArg);
    if (signature !== undefined) {
      return checker.getReturnTypeOfSignature(signature);
    }
  }

  // Fallback: use the expression's type itself.
  return checker.getTypeAtLocation(factoryArg);
}
