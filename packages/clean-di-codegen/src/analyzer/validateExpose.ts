import type { Diagnostic } from "../diagnostics/codes.js";

import type { BeanScope } from "./buildBeanScope.js";
import type { ContextDeclaration } from "./collectContexts.js";

/**
 * Verify that every name in `context.expose` exists in `scope`. Emit
 * `CDI-004 MissingExposeTarget` for each missing name. Returns the array of
 * diagnostics (empty if everything checks out).
 *
 * Per DESIGN §5.7 the `expose` whitelist is compile-time-checked at the type
 * level (`expose: (keyof Beans)[]`), but the codegen needs a runtime safety net
 * because the type-level check can be bypassed by `as const` mismatches or
 * imports whose bean shape changed.
 */
export function validateExpose(
  context: ContextDeclaration,
  scope: BeanScope,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const source = context.callExpression.getSourceFile();

  for (const exposedName of context.expose) {
    if (scope.has(exposedName)) {
      continue;
    }

    // Position points at the spec's `expose` array; for v1 we just use the
    // callExpression's location since walking back to the exact array element
    // requires re-extracting it. Acceptable precision for a build-time error.
    const { line, character } = source.getLineAndCharacterOfPosition(
      context.callExpression.getStart(),
    );

    diagnostics.push({
      code: "CDI-004",
      file: source.fileName,
      line: line + 1,
      column: character + 1,
      message: `MissingExposeTarget: bean "${exposedName}" listed in 'expose' is not declared in this context's beans (and is not pulled in via imports).`,
      hint: `Either add "${exposedName}" to the beans map, import it via a defineConfig, or remove it from the expose array.`,
    });
  }

  return diagnostics;
}
