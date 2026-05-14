import ts from "typescript";

import type { Diagnostic } from "../diagnostics/codes.js";
import type { BeanScope, BeanScopeEntry } from "./buildBeanScope.js";
import { resolveOneParam } from "./resolveOneParam.js";

export interface ResolveConstructorInput {
  readonly classDeclaration: ts.ClassDeclaration;
  readonly scope: BeanScope;
  readonly checker: ts.TypeChecker;
  /**
   * The bean entry whose constructor we're resolving — supplies the override
   * map for `resolveOneParam`. Optional for backward compatibility with W3
   * callers; when absent, parameters resolve by type matching only.
   */
  readonly ownerEntry?: BeanScopeEntry;
}

export interface ResolveConstructorResult {
  /**
   * Resolved bean names in positional order. `null` entries mark optional
   * parameters that were silently skipped (the caller emits `, undefined` or
   * truncates trailing nulls).
   */
  readonly args: readonly (string | null)[];
  /** Diagnostics accumulated during resolution. */
  readonly diagnostics: readonly Diagnostic[];
  /** True if a CDI-008 was emitted — the class is unsupported. */
  readonly refused: boolean;
}

/**
 * Resolve a class's constructor signature against the bean scope.
 *
 * Behavior:
 *  - No explicit constructor (synthesized default) → returns `args: []`.
 *  - Zero-arg explicit constructor → returns `args: []`.
 *  - Private or protected constructor → emits CDI-008, returns `refused: true`.
 *  - Spread/rest parameter (`...args: T[]`) → emits CDI-008, returns `refused: true`.
 *  - Destructured parameter → emits CDI-008, returns `refused: true`.
 *  - Otherwise: iterate parameters, call `resolveOneParam` for each, collect
 *    diagnostics.
 */
export function resolveConstructor(input: ResolveConstructorInput): ResolveConstructorResult {
  const { classDeclaration, scope, checker, ownerEntry } = input;
  const ctor = findFirstConstructor(classDeclaration);

  // No constructor declared — default no-arg constructor.
  if (ctor === null) {
    return { args: [], diagnostics: [], refused: false };
  }

  // Private / protected constructor — refuse with CDI-008.
  if (hasInaccessibleModifier(ctor)) {
    return {
      args: [],
      diagnostics: [diagCdi008(ctor, "private or protected constructors are not supported")],
      refused: true,
    };
  }

  if (ctor.parameters.length === 0) {
    return { args: [], diagnostics: [], refused: false };
  }

  const args: (string | null)[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const param of ctor.parameters) {
    if (param.dotDotDotToken !== undefined) {
      // Rest/spread parameter — refuse.
      return {
        args: [],
        diagnostics: [diagCdi008(param, "rest/spread constructor parameters are not supported")],
        refused: true,
      };
    }
    if (
      !ts.isIdentifier(param.name) // Destructured object/array binding → not supported.
    ) {
      return {
        args: [],
        diagnostics: [diagCdi008(param, "destructured constructor parameters are not supported")],
        refused: true,
      };
    }

    const result = resolveOneParam({ param, scope, checker, ownerEntry });
    args.push(result.beanName);
    diagnostics.push(...result.diagnostics);
  }

  return { args, diagnostics, refused: false };
}

function findFirstConstructor(cls: ts.ClassDeclaration): ts.ConstructorDeclaration | null {
  for (const member of cls.members) {
    if (ts.isConstructorDeclaration(member)) {
      return member;
    }
  }
  return null;
}

function hasInaccessibleModifier(ctor: ts.ConstructorDeclaration): boolean {
  const modifiers = ts.getModifiers(ctor);
  if (modifiers === undefined) return false;
  for (const mod of modifiers) {
    if (mod.kind === ts.SyntaxKind.PrivateKeyword) return true;
    if (mod.kind === ts.SyntaxKind.ProtectedKeyword) return true;
  }
  return false;
}

function diagCdi008(node: ts.Node, detail: string): Diagnostic {
  const source = node.getSourceFile();
  const { line, character } = source.getLineAndCharacterOfPosition(node.getStart());
  return {
    code: "CDI-008",
    file: source.fileName,
    line: line + 1,
    column: character + 1,
    message: `UnsupportedConstructor: ${detail}.`,
    hint: "Use `provide(() => YourClass.create(...))` to construct manually.",
  };
}
