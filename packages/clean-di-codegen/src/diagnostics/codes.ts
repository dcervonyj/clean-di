/**
 * Diagnostic code catalog for clean-di-codegen.
 *
 * - `CDI-NNN` codes are emitted at codegen time (build errors).
 * - `CDIE-NNN` codes are emitted at runtime (caught by createContext).
 *
 * See DESIGN.md §8 for the full specification.
 */

export const DIAGNOSTIC_CODES = {
  // Codegen errors
  CDI_001: "CDI-001",
  CDI_002: "CDI-002",
  CDI_003: "CDI-003",
  CDI_004: "CDI-004",
  CDI_005: "CDI-005",
  CDI_006: "CDI-006",
  CDI_007: "CDI-007",
  CDI_008: "CDI-008",
  CDI_009: "CDI-009",
  CDI_010: "CDI-010",

  // Runtime errors (informational — emitted by clean-di runtime, defined here so
  // the codegen can reference them in messages / docs without circular imports)
  CDIE_101: "CDIE-101",
  CDIE_102: "CDIE-102",
  CDIE_103: "CDIE-103",
  CDIE_104: "CDIE-104",
} as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[keyof typeof DIAGNOSTIC_CODES];

/**
 * A single diagnostic produced by the codegen analyzer.
 *
 * Format mirrors TypeScript's standard diagnostic shape so editors and CI
 * pipelines can surface them via existing tooling.
 */
export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly hint?: string;
}

/**
 * Default human-readable message for each code. The full diagnostic message
 * combines this template with context-specific details supplied at the call
 * site (e.g., "the bean named 'foo' could not be resolved").
 */
export const DEFAULT_MESSAGES: Readonly<Record<DiagnosticCode, string>> = {
  "CDI-001": "UnresolvableDependency: no bean in scope matches the constructor parameter.",
  "CDI-002":
    "AmbiguousDependency: multiple beans of the same type match the constructor parameter.",
  "CDI-003": "CyclicDependency: bean construction graph contains a cycle.",
  "CDI-004": "MissingExposeTarget: the bean named in `expose` does not exist in scope.",
  "CDI-005": "InvalidContextShape: `defineContext` call is malformed.",
  "CDI-006": "DuplicateBean: the same bean name appears in `beans` and an imported config.",
  "CDI-007": "InvalidBeanDef: bean entry is neither `bean(...)` nor `provide(...)`.",
  "CDI-008":
    "UnsupportedConstructor: spread, destructured, or private/protected constructors are not supported.",
  "CDI-009":
    "ConfigTypeNotFound: the `defineContext<TConfig>()` type parameter could not be resolved.",
  "CDI-010": "InvalidImport: `imports` entry is not a `defineConfig(...)` result.",
  "CDIE-101": "Container.get() called for a key after destroy().",
  "CDIE-102": "Container.destroy() called for an unknown key (warning, not fatal).",
  "CDIE-103": "postConstruct threw during context build.",
  "CDIE-104": "preDestroy threw during context teardown.",
};

/**
 * Suggested fix hint per code (used when the analyzer can't produce a more
 * context-specific suggestion).
 */
export const DEFAULT_HINTS: Readonly<Record<DiagnosticCode, string>> = {
  "CDI-001":
    "Declare the missing dependency with `bean(...)` or `provide(...)`, or pull it in via `imports`.",
  "CDI-002": "Add a `bean(Class, { paramName: 'beanName' })` override to disambiguate.",
  "CDI-003": "Refactor to break the cycle — extract the shared state into a third bean.",
  "CDI-004": "Add the bean to the context's `beans` map or correct the name in `expose`.",
  "CDI-005": "Use `defineContext<TConfig>()(spec)` with both `beans` and `expose` keys.",
  "CDI-006": "Rename one of the conflicting beans.",
  "CDI-007": "Wrap the value in `bean(Class)` or `provide(() => value)`.",
  "CDI-008": "Use `provide(() => Class.factory(...))` to construct manually.",
  "CDI-009": "Import the type or fix the reference in `defineContext<TConfig>()`.",
  "CDI-010": "Pass the result of `defineConfig({...})`, not a raw object or `bean(...)` call.",
  "CDIE-101": "Use a fresh `key` after `destroy()` or create a new container.",
  "CDIE-102": "This warning is benign if the key was never used; otherwise verify lifecycle.",
  "CDIE-103": "See the `cause` of the thrown error for the original failure.",
  "CDIE-104": "See the `.errors` array on the AggregateError for individual teardown failures.",
};
