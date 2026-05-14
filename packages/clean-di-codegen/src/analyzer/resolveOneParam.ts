import ts from "typescript";

import type { Diagnostic } from "../diagnostics/codes.js";
import type { BeanScope, BeanScopeEntry } from "./buildBeanScope.js";

export interface ResolveParamInput {
  /** Parameter to resolve. */
  readonly param: ts.ParameterDeclaration;
  /** Bean scope built by `buildBeanScope`. */
  readonly scope: BeanScope;
  /** TS type checker (from the program). */
  readonly checker: ts.TypeChecker;
  /**
   * The bean entry whose constructor we're resolving. Supplies the `overrides`
   * map (the W4 escape hatch). Optional — when absent, resolution falls back
   * to the W3 type-matching behavior only.
   */
  readonly ownerEntry: BeanScopeEntry | undefined;
}

export interface ResolveParamResult {
  /** The matched bean's name, or null if no resolution. */
  readonly beanName: string | null;
  /** Whether the parameter was optional and was deliberately skipped. */
  readonly skippedAsOptional: boolean;
  /** Diagnostics accumulated during resolution (may be empty). */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Resolver for one constructor parameter against the bean scope.
 *
 * Resolution order (DESIGN §7.3 step 3):
 *  1. **Override** — if `ownerEntry.overrides[paramName]` is set, the named
 *     bean wins outright. If it doesn't exist in scope or its type doesn't
 *     match the parameter type, emit `CDI-001` with a hint pointing at the
 *     override (the user explicitly asked for it — don't silently fall back).
 *  2. **Type matching** — filter the scope by `isTypeAssignableTo` and pick
 *     the unique match. Zero matches on a required param → `CDI-001`. Zero
 *     matches on an optional param → silently skip. Multiple matches → `CDI-002`.
 *
 * Name fallback (W4 — T-044) extends this in place.
 */
export function resolveOneParam(input: ResolveParamInput): ResolveParamResult {
  const { param, scope, checker, ownerEntry } = input;
  const paramName = param.name.getText();
  const paramType = checker.getTypeAtLocation(param);
  const position = getParamPosition(param);

  // Step 3a — explicit override wins over type matching.
  const overrideTarget = ownerEntry?.overrides[paramName];
  if (overrideTarget !== undefined) {
    return resolveByOverride({
      overrideTarget,
      paramName,
      paramType,
      scope,
      checker,
      position,
    });
  }

  const matches: string[] = [];
  for (const [name, entry] of scope) {
    const entryType = getBeanType(checker, entry);
    if (entryType === undefined) continue;
    if (checker.isTypeAssignableTo(entryType, paramType)) {
      matches.push(name);
    }
  }

  const isOptional = isOptionalParam(param);

  if (matches.length === 1) {
    return { beanName: matches[0]!, skippedAsOptional: false, diagnostics: [] };
  }

  if (matches.length === 0) {
    if (isOptional) {
      return { beanName: null, skippedAsOptional: true, diagnostics: [] };
    }

    const typeText = checker.typeToString(paramType);
    return {
      beanName: null,
      skippedAsOptional: false,
      diagnostics: [
        {
          code: "CDI-001",
          file: position.file,
          line: position.line,
          column: position.column,
          message: `UnresolvableDependency: parameter "${paramName}: ${typeText}" has no matching bean in scope.`,
          hint: "Declare the missing dependency with `bean(...)` or `provide(...)`, or pull it in via `imports`.",
        },
      ],
    };
  }

  // matches.length > 1 — ambiguous
  return {
    beanName: null,
    skippedAsOptional: false,
    diagnostics: [
      {
        code: "CDI-002",
        file: position.file,
        line: position.line,
        column: position.column,
        message: `AmbiguousDependency: parameter "${paramName}" matches multiple beans: ${matches.join(", ")}.`,
        hint: `Add an override: \`bean(YourClass, { ${paramName}: "<beanName>" })\`.`,
      },
    ],
  };
}

interface ResolveByOverrideInput {
  readonly overrideTarget: string;
  readonly paramName: string;
  readonly paramType: ts.Type;
  readonly scope: BeanScope;
  readonly checker: ts.TypeChecker;
  readonly position: { file: string; line: number; column: number };
}

function resolveByOverride(input: ResolveByOverrideInput): ResolveParamResult {
  const { overrideTarget, paramName, paramType, scope, checker, position } = input;

  const overrideEntry = scope.get(overrideTarget);
  if (overrideEntry === undefined) {
    return {
      beanName: null,
      skippedAsOptional: false,
      diagnostics: [
        {
          code: "CDI-001",
          file: position.file,
          line: position.line,
          column: position.column,
          message: `UnresolvableDependency: override for parameter "${paramName}" targets bean "${overrideTarget}", which does not exist in scope.`,
          hint: `Declare a bean named "${overrideTarget}" in this context, import it, or correct the override target.`,
        },
      ],
    };
  }

  const overrideType = getBeanType(checker, overrideEntry);
  if (overrideType === undefined || !checker.isTypeAssignableTo(overrideType, paramType)) {
    const paramTypeText = checker.typeToString(paramType);
    const overrideTypeText =
      overrideType !== undefined ? checker.typeToString(overrideType) : "<unknown>";
    return {
      beanName: null,
      skippedAsOptional: false,
      diagnostics: [
        {
          code: "CDI-001",
          file: position.file,
          line: position.line,
          column: position.column,
          message: `UnresolvableDependency: override for parameter "${paramName}" targets bean "${overrideTarget}" of type "${overrideTypeText}", which is not assignable to parameter type "${paramTypeText}".`,
          hint: `Point the override at a bean whose type is assignable to "${paramTypeText}", or remove the override and let type matching pick a bean.`,
        },
      ],
    };
  }

  return { beanName: overrideTarget, skippedAsOptional: false, diagnostics: [] };
}

/**
 * Resolve the effective type of a bean scope entry:
 *  - For `bean(Class)` → the instance type of the class.
 *  - For `provide(fn)` → the recorded return type.
 */
function getBeanType(
  checker: ts.TypeChecker,
  entry: BeanScope extends ReadonlyMap<string, infer E> ? E : never,
): ts.Type | undefined {
  if (entry.kind === "bean") {
    if (entry.classSymbol !== undefined) {
      // For class symbols, the symbol's declared type is the constructor; we
      // want the instance type, which is the symbol's `getDeclaredType()`.
      return checker.getDeclaredTypeOfSymbol(entry.classSymbol);
    }
    return undefined;
  }
  // provide
  return entry.provideType;
}

function isOptionalParam(param: ts.ParameterDeclaration): boolean {
  // `?` modifier or `= default` value both make the param effectively optional
  // for our resolution purposes (DESIGN §7.4).
  if (param.questionToken !== undefined) return true;
  if (param.initializer !== undefined) return true;
  return false;
}

function getParamPosition(param: ts.ParameterDeclaration): {
  file: string;
  line: number;
  column: number;
} {
  const source = param.getSourceFile();
  const { line, character } = source.getLineAndCharacterOfPosition(param.getStart());
  return {
    file: source.fileName,
    line: line + 1,
    column: character + 1,
  };
}
