import * as ts from "typescript";

import type { Diagnostic } from "../diagnostics/codes.js";

import type { BeanScope } from "./buildBeanScope.js";
import type { ContextDeclaration } from "./collectContexts.js";

/**
 * Validate the `postConstruct` / `preDestroy` lifecycle hook expressions on a
 * single context. Each hook (when present) must be a function whose first
 * parameter accepts the assembled `Beans` map and (when the context has a
 * non-void `TConfig`) whose second parameter accepts the config object.
 *
 * Emits `CDI-014 InvalidHookSignature` for each mismatch. The return type is
 * deliberately not constrained: both `void` and `Promise<void>` (and anything
 * the user wants to discard) are acceptable since async lifecycle landed in
 * T-095.
 *
 * Note: this is a best-effort structural check. The TypeScript checker is
 * conservative about callable signature inference for arrow functions whose
 * contextual type is `any` — when no signatures can be resolved at all we
 * silently skip rather than flag false positives.
 */
export function validateHooks(
  context: ContextDeclaration,
  scope: BeanScope,
  checker: ts.TypeChecker,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (context.postConstruct !== undefined) {
    const d = checkHookExpression(checker, scope, context, "postConstruct", context.postConstruct);
    if (d !== undefined) diagnostics.push(d);
  }
  if (context.preDestroy !== undefined) {
    const d = checkHookExpression(checker, scope, context, "preDestroy", context.preDestroy);
    if (d !== undefined) diagnostics.push(d);
  }

  return diagnostics;
}

function checkHookExpression(
  checker: ts.TypeChecker,
  scope: BeanScope,
  context: ContextDeclaration,
  hookName: "postConstruct" | "preDestroy",
  expr: ts.Expression,
): Diagnostic | undefined {
  const hookType = checker.getTypeAtLocation(expr);
  const signatures = hookType.getCallSignatures();

  if (signatures.length === 0) {
    return makeDiagnostic(
      expr,
      hookName,
      "the value is not callable — it must be an arrow function or function expression.",
    );
  }

  const signature = signatures[0]!;
  const params = signature.getParameters();

  // First parameter — the assembled beans bag.
  if (params.length === 0) {
    return makeDiagnostic(
      expr,
      hookName,
      "the hook must accept a first parameter for the assembled beans (e.g. `({ logger }) => ...`).",
    );
  }

  const beansParam = params[0]!;
  const beansParamType = checker.getTypeOfSymbolAtLocation(beansParam, expr);

  // Skip the structural check if the user typed the param as `any` / `unknown`
  // — that's an explicit opt-out.
  if (!(beansParamType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown))) {
    // The param must at minimum be an object type — primitive params can't
    // possibly accept the beans bag.
    const isObjectLike = (beansParamType.flags & ts.TypeFlags.Object) !== 0;
    if (!isObjectLike) {
      const typeText = checker.typeToString(beansParamType);

      return makeDiagnostic(
        expr,
        hookName,
        `the first parameter must accept the beans bag (an object) — got '${typeText}'.`,
      );
    }

    // Verify every property the hook param expects is satisfied by a bean
    // in scope with an assignable type. This catches `({ missingBean }) => ...`
    // and `({ logger }: { logger: string }) => ...`.
    for (const prop of beansParamType.getProperties()) {
      const propName = prop.name;
      const expectedType = checker.getTypeOfSymbolAtLocation(prop, expr);
      const beanEntry = scope.get(propName);
      if (beanEntry === undefined) {
        return makeDiagnostic(
          expr,
          hookName,
          `the first parameter references bean '${propName}', which is not declared in this context.`,
        );
      }

      const beanType = getBeanResolvedType(checker, beanEntry);
      if (
        beanType !== undefined &&
        !(expectedType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) &&
        !checker.isTypeAssignableTo(beanType, expectedType)
      ) {
        const expectedText = checker.typeToString(expectedType);
        const actualText = checker.typeToString(beanType);

        return makeDiagnostic(
          expr,
          hookName,
          `bean '${propName}' has type '${actualText}', which is not assignable to the hook's expected '${expectedText}'.`,
        );
      }
    }
  }

  // Second parameter (config). Only required when the context's TConfig is
  // non-void. When the user passes a 2-arg hook on a void-config context, we
  // still allow it (extra param is ignored at runtime).
  const hasConfig = context.configType !== undefined && context.configTypeName !== "void";
  if (hasConfig && params.length >= 2) {
    const cfgParam = params[1]!;
    const cfgParamType = checker.getTypeOfSymbolAtLocation(cfgParam, expr);
    const expectedConfigType = context.configType!;

    if (
      !(cfgParamType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) &&
      !checker.isTypeAssignableTo(expectedConfigType, cfgParamType)
    ) {
      const expectedText = checker.typeToString(cfgParamType);
      const actualText = checker.typeToString(expectedConfigType);

      return makeDiagnostic(
        expr,
        hookName,
        `the second parameter must accept the context config '${actualText}' — got '${expectedText}'.`,
      );
    }
  }

  return undefined;
}

function getBeanResolvedType(
  checker: ts.TypeChecker,
  entry: BeanScope extends ReadonlyMap<string, infer E> ? E : never,
): ts.Type | undefined {
  if (entry.kind === "bean") {
    if (entry.classSymbol !== undefined) {
      return checker.getDeclaredTypeOfSymbol(entry.classSymbol);
    }

    return undefined;
  }

  if (entry.kind === "provide") {
    if (entry.provideType === undefined) return undefined;
    const typeArgs = checker.getTypeArguments(entry.provideType as ts.TypeReference);
    if (typeArgs.length === 0) return undefined;
    const inner = typeArgs[0]!;
    if (inner.flags & (ts.TypeFlags.Never | ts.TypeFlags.Any)) return undefined;

    return inner;
  }

  // Synthetic config entry — provideType is the actual field type.
  return entry.provideType;
}

function makeDiagnostic(
  expr: ts.Expression,
  hookName: "postConstruct" | "preDestroy",
  detail: string,
): Diagnostic {
  const source = expr.getSourceFile();
  const { line, character } = source.getLineAndCharacterOfPosition(expr.getStart());

  return {
    code: "CDI-014",
    file: source.fileName,
    line: line + 1,
    column: character + 1,
    message: `InvalidHookSignature: \`${hookName}\` — ${detail}`,
    hint: "Match the hook signature to `({ ...beans }: Beans, cfg: TConfig) => void | Promise<void>`.",
  };
}
