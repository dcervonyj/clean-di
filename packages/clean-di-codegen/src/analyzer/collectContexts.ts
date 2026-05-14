import ts from "typescript";

import { DEFAULT_HINTS, DEFAULT_MESSAGES, type Diagnostic } from "../diagnostics/codes.js";

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

export interface CollectContextsResult {
  readonly contexts: readonly ContextDeclaration[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Walk the parsed call list and produce one `ContextDeclaration` per
 * `defineContext` site. Returns the well-formed contexts together with any
 * `CDI-005 InvalidContextShape` diagnostics raised for malformed sites; the
 * malformed sites are skipped so emission can proceed for the rest of the file.
 *
 * Shape rules enforced here (each violation → CDI-005):
 *   1. `defineContext<T>()(spec)` must be curried — the outer call must be
 *      followed by an inner call that passes the spec.
 *   2. The spec must be an object literal, not a variable / other expression.
 *   3. `beans` must be present and an object literal.
 *   4. `expose` must be present and an array literal of string literals.
 *   5. `imports`, if present, must be an array literal.
 */
export function collectContexts(parsed: ParsedDiFile): CollectContextsResult {
  const contexts: ContextDeclaration[] = [];
  const diagnostics: Diagnostic[] = [];
  const checker = parsed.program.getTypeChecker();

  for (const call of parsed.calls) {
    if (call.kind !== "defineContext") continue;

    const innerCall = findInnerCall(call);
    if (innerCall === null) {
      diagnostics.push(cdi005(call.node, "missing curry — use `defineContext<T>()(spec)`"));
      continue;
    }

    const spec = innerCall.arguments[0];
    if (spec === undefined || !ts.isObjectLiteralExpression(spec)) {
      diagnostics.push(cdi005(innerCall, "spec argument must be an inline object literal"));
      continue;
    }

    const beansProp = findProperty(spec, "beans");
    if (beansProp === undefined || !ts.isObjectLiteralExpression(beansProp.initializer)) {
      diagnostics.push(cdi005(spec, "`beans` field is required and must be an object literal"));
      continue;
    }

    const exposeProp = findProperty(spec, "expose");
    if (exposeProp === undefined || !isExposeArray(exposeProp.initializer)) {
      diagnostics.push(
        cdi005(
          spec,
          "`expose` field is required and must be a (readonly) array of string literals",
        ),
      );
      continue;
    }

    const importsProp = findProperty(spec, "imports");
    if (importsProp !== undefined && !ts.isArrayLiteralExpression(importsProp.initializer)) {
      diagnostics.push(cdi005(spec, "`imports` field must be an array literal"));
      continue;
    }

    const configType = extractConfigType(checker, call.node);
    if (!configType.resolved) {
      diagnostics.push(cdi009(configType.node ?? call.node, configType.typeName));
      // Skip the context to mirror CDI-005 behavior on malformed input.
      continue;
    }

    contexts.push({
      exportName: extractExportName(innerCall),
      configTypeName: configType.typeName,
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

  return { contexts, diagnostics };
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

interface ExtractedConfigType {
  /** Display name for the `<TConfig>` slot — `"void"` when omitted. */
  readonly typeName: string;
  /** True when the checker resolved the reference (or it was intentionally `void` / absent). */
  readonly resolved: boolean;
  /** The original type-node, kept for diagnostic positioning. */
  readonly node: ts.TypeNode | undefined;
}

/**
 * Pull the `<TConfig>` argument from `defineContext<TConfig>()` and ask the
 * checker to resolve it. We only flag a CDI-009 for a *type reference* node
 * whose symbol/alias the checker couldn't find — primitive keywords (`void`,
 * `any`, `unknown`, etc.) and the omitted case are always treated as resolved
 * because they are not type lookups by the user.
 */
function extractConfigType(
  checker: ts.TypeChecker,
  outerCall: ts.CallExpression,
): ExtractedConfigType {
  const typeArgs = outerCall.typeArguments;
  if (typeArgs === undefined || typeArgs.length === 0) {
    return { typeName: "void", resolved: true, node: undefined };
  }

  const node = typeArgs[0]!;
  if (node.kind === ts.SyntaxKind.VoidKeyword) {
    return { typeName: "void", resolved: true, node };
  }

  // For non-reference type nodes (intersection, union, literal, keyword like
  // `any`/`unknown`/`never`), there's nothing to "look up" — accept verbatim.
  if (!ts.isTypeReferenceNode(node)) {
    return { typeName: displayName(node), resolved: true, node };
  }

  const resolved = isTypeReferenceResolved(checker, node);

  return { typeName: displayName(node), resolved, node };
}

/**
 * Probe whether the root identifier of a type-reference resolves to a real
 * declaration in scope. The checker silently substitutes `any` when a name
 * doesn't bind — so we look up the identifier directly via `resolveName` with
 * `SymbolFlags.Type`. An `undefined` symbol means the name is unknown.
 */
function isTypeReferenceResolved(checker: ts.TypeChecker, node: ts.TypeReferenceNode): boolean {
  const root = getRootIdentifier(node.typeName);
  const symbol = checker.resolveName(root.text, root, ts.SymbolFlags.Type, false);

  return symbol !== undefined;
}

/** Return the leftmost identifier of a (possibly qualified) entity name. */
function getRootIdentifier(name: ts.EntityName): ts.Identifier {
  return ts.isIdentifier(name) ? name : getRootIdentifier(name.left);
}

function displayName(node: ts.TypeNode): string {
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
    return node.typeName.text;
  }

  return node.getText();
}

function findProperty(
  spec: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment | undefined {
  for (const prop of spec.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (prop.name === undefined) continue;
    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;
    if (prop.name.text === name) return prop;
  }

  return undefined;
}

function isExposeArray(expr: ts.Expression): boolean {
  // Strip `as const` / `as Readonly<...>` wrappers — they're shape-equivalent.
  let init: ts.Expression = expr;
  while (ts.isAsExpression(init)) {
    init = init.expression;
  }

  return ts.isArrayLiteralExpression(init);
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

function cdi005(node: ts.Node, detail: string): Diagnostic {
  const source = node.getSourceFile();
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart());

  return {
    code: "CDI-005",
    file: source.fileName,
    line: line + 1,
    column: character + 1,
    message: `${DEFAULT_MESSAGES["CDI-005"]} ${detail}.`,
    hint: DEFAULT_HINTS["CDI-005"],
  };
}

function cdi009(node: ts.Node, typeName: string): Diagnostic {
  const source = node.getSourceFile();
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart());

  return {
    code: "CDI-009",
    file: source.fileName,
    line: line + 1,
    column: character + 1,
    message: `${DEFAULT_MESSAGES["CDI-009"]} Cannot find type '${typeName}'.`,
    hint: DEFAULT_HINTS["CDI-009"],
  };
}
