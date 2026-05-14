import ts from "typescript";

import type { Diagnostic } from "../diagnostics/codes.js";
import type { BeanScope } from "./buildBeanScope.js";

export interface ResolveParamInput {
  /** Parameter to resolve. */
  readonly param: ts.ParameterDeclaration;
  /** Bean scope built by `buildBeanScope`. */
  readonly scope: BeanScope;
  /** TS type checker (from the program). */
  readonly checker: ts.TypeChecker;
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
 * MVP resolver: filter bean scope by type assignability, pick the unique match.
 *
 * v3 supports type matching only. Overrides (W4 — T-043) and parameter-name
 * fallback (W4 — T-044) extend this in place.
 *
 * Semantics:
 *  - Exactly one type match → return its name.
 *  - Zero matches and param is optional → return null, skippedAsOptional = true.
 *  - Zero matches and param is required → emit CDI-001, return null.
 *  - Multiple matches → emit CDI-002, return null.
 */
export function resolveOneParam(input: ResolveParamInput): ResolveParamResult {
  const { param, scope, checker } = input;
  const paramType = checker.getTypeAtLocation(param);

  const matches: string[] = [];
  for (const [name, entry] of scope) {
    const entryType = getBeanType(checker, entry);
    if (entryType === undefined) continue;
    if (checker.isTypeAssignableTo(entryType, paramType)) {
      matches.push(name);
    }
  }

  const isOptional = isOptionalParam(param);
  const position = getParamPosition(param);

  if (matches.length === 1) {
    return { beanName: matches[0]!, skippedAsOptional: false, diagnostics: [] };
  }

  if (matches.length === 0) {
    if (isOptional) {
      return { beanName: null, skippedAsOptional: true, diagnostics: [] };
    }

    const paramName = param.name.getText();
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
  const paramName = param.name.getText();
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
