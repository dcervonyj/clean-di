import ts from "typescript";

import type { DiCall, ParsedDiFile } from "./parseDiFile.js";

export interface BeanDeclaration {
  /** The key in the `beans: { ... }` object literal. */
  readonly name: string;
  /** The full `bean(Class)` or `provide(fn)` call expression. */
  readonly callExpression: ts.CallExpression;
  /** Whether the bean was declared via `bean(...)` or `provide(...)`. */
  readonly kind: "bean" | "provide";
}

export interface ContextDeclaration {
  /** The bean name on which the context is exported (variable name, e.g., `postsContext`). */
  readonly exportName: string;
  /** The `<TConfig>` type reference text, or `"void"` when omitted. */
  readonly configTypeName: string;
  /** Beans in source order. */
  readonly beans: readonly BeanDeclaration[];
  /** The exposed keys (from `expose: [...] as const`). */
  readonly expose: readonly string[];
  /** Optional postConstruct AST node — preserved for the emitter to re-print. */
  readonly postConstruct: ts.Expression | undefined;
  /** Optional preDestroy AST node — preserved for the emitter to re-print. */
  readonly preDestroy: ts.Expression | undefined;
  /** Raw `imports: [...]` expressions — kept untouched for W4 to resolve. */
  readonly imports: readonly ts.Expression[];
  /** The original inner `defineContext<...>()(spec)` call, kept for diagnostics. */
  readonly callExpression: ts.CallExpression;
}

/**
 * Walk the parsed call list and produce one `ContextDeclaration` per
 * `defineContext` site. Returns an array; multiple contexts per file is allowed
 * but warned to stderr because it's a smell (DESIGN §5.1 implies one per file).
 */
export function collectContexts(parsed: ParsedDiFile): readonly ContextDeclaration[] {
  const contexts: ContextDeclaration[] = [];

  // Find every `defineContext` call site and resolve the *inner* call from it.
  for (const call of parsed.calls) {
    if (call.kind !== "defineContext") continue;

    const innerCall = findInnerCall(call);
    if (innerCall === null) continue; // malformed — analyzer's CDI-005 validator (T-048) will pick this up in W4

    const exportName = extractExportName(innerCall);
    const configTypeName = extractConfigTypeName(call.node);
    const spec = innerCall.arguments[0];
    if (spec === undefined || !ts.isObjectLiteralExpression(spec)) continue;

    contexts.push({
      exportName,
      configTypeName,
      beans: extractBeans(spec),
      expose: extractExposeList(spec),
      postConstruct: extractHook(spec, "postConstruct"),
      preDestroy: extractHook(spec, "preDestroy"),
      imports: extractImports(spec),
      callExpression: innerCall,
    });
  }

  if (contexts.length > 1) {
    // eslint-disable-next-line no-console
    console.warn(
      `clean-di-codegen: ${parsed.sourceFile.fileName} contains ${contexts.length} contexts — one per file is recommended.`,
    );
  }

  return contexts;
}

/**
 * `defineContext()(spec)` is two chained calls. `parseDiFile` records the outer
 * `defineContext` call. The inner call is the `ts.CallExpression` whose
 * `.expression` is the outer call.
 */
function findInnerCall(diCall: DiCall): ts.CallExpression | null {
  const outer = diCall.node;
  const parent = outer.parent;

  if (parent !== undefined && ts.isCallExpression(parent) && parent.expression === outer) {
    return parent;
  }

  return null;
}

function extractExportName(call: ts.CallExpression): string {
  // Walk up: VariableDeclaration -> Identifier.text
  let n: ts.Node = call;
  while (n.parent !== undefined && !ts.isVariableDeclaration(n.parent)) {
    n = n.parent;
  }
  if (n.parent !== undefined && ts.isVariableDeclaration(n.parent)) {
    const nameNode = n.parent.name;
    if (ts.isIdentifier(nameNode)) {
      return nameNode.text;
    }
  }
  return "unnamed";
}

function extractConfigTypeName(outerCall: ts.CallExpression): string {
  const typeArgs = outerCall.typeArguments;
  if (typeArgs === undefined || typeArgs.length === 0) {
    return "void";
  }

  const first = typeArgs[0]!;
  if (ts.isTypeReferenceNode(first) && ts.isIdentifier(first.typeName)) {
    return first.typeName.text;
  }

  return first.getText();
}

function extractBeans(spec: ts.ObjectLiteralExpression): readonly BeanDeclaration[] {
  const beans: BeanDeclaration[] = [];

  for (const prop of spec.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (prop.name === undefined) continue;
    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;

    const propName = prop.name.text;
    if (propName !== "beans") continue;

    if (!ts.isObjectLiteralExpression(prop.initializer)) continue;

    for (const beanProp of prop.initializer.properties) {
      if (!ts.isPropertyAssignment(beanProp)) continue;
      if (beanProp.name === undefined) continue;
      if (!ts.isIdentifier(beanProp.name) && !ts.isStringLiteral(beanProp.name)) continue;

      const beanName = beanProp.name.text;
      const rhs = beanProp.initializer;
      if (!ts.isCallExpression(rhs)) continue;

      // We rely on parseDiFile's call list for symbol-identity matching;
      // here we just record the call and classify by callee identifier text
      // as a fast heuristic. parseDiFile's `calls` array already filtered
      // these to `bean` / `provide` so the heuristic is safe in context.
      const calleeText = rhs.expression.getText();
      const kind: BeanDeclaration["kind"] = calleeText.startsWith("provide") ? "provide" : "bean";

      beans.push({ name: beanName, callExpression: rhs, kind });
    }
  }

  return beans;
}

function extractExposeList(spec: ts.ObjectLiteralExpression): readonly string[] {
  for (const prop of spec.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (prop.name === undefined) continue;
    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;
    if (prop.name.text !== "expose") continue;

    // Strip `as const` wrapper if present.
    let init: ts.Expression = prop.initializer;
    while (ts.isAsExpression(init)) {
      init = init.expression;
    }

    if (!ts.isArrayLiteralExpression(init)) return [];

    const keys: string[] = [];
    for (const element of init.elements) {
      if (ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element)) {
        keys.push(element.text);
      }
    }
    return keys;
  }

  return [];
}

function extractHook(
  spec: ts.ObjectLiteralExpression,
  hookName: "postConstruct" | "preDestroy",
): ts.Expression | undefined {
  for (const prop of spec.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (prop.name === undefined) continue;
    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;
    if (prop.name.text !== hookName) continue;

    return prop.initializer;
  }
  return undefined;
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
