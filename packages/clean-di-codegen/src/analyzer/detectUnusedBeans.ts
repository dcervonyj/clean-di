import type { Diagnostic } from "../diagnostics/codes.js";

import type { BeanScope } from "./buildBeanScope.js";

export interface DetectUnusedBeansInput {
  /** The full resolved bean scope (locals + imported + synthetic config beans). */
  readonly scope: BeanScope;
  /**
   * Map from bean name to the names of beans it depends on (constructor params
   * and free `cfg.*` references). Matches the graph passed to `topoSort`.
   */
  readonly graph: ReadonlyMap<string, readonly string[]>;
  /** The exposed bean names — entry points for the reachability walk. */
  readonly expose: readonly string[];
}

/**
 * Walk the dependency graph starting from each `expose` target and flag any
 * bean that isn't transitively reached. Synthetic config beans (`kind ===
 * "config"`) are exempt — they exist as a name-fallback for `TConfig` fields
 * and the user did not explicitly declare them.
 *
 * Severity: warning (CDI-011) — the build still produces a generated file.
 */
export function detectUnusedBeans(input: DetectUnusedBeansInput): readonly Diagnostic[] {
  const { scope, graph, expose } = input;
  const reachable = new Set<string>();
  const stack: string[] = [];

  for (const name of expose) {
    if (!reachable.has(name)) {
      reachable.add(name);
      stack.push(name);
    }
  }

  while (stack.length > 0) {
    const current = stack.pop()!;
    const deps = graph.get(current) ?? [];
    for (const dep of deps) {
      if (!reachable.has(dep)) {
        reachable.add(dep);
        stack.push(dep);
      }
    }
  }

  const diagnostics: Diagnostic[] = [];
  for (const [name, entry] of scope) {
    if (entry.kind === "config") continue;
    if (reachable.has(name)) continue;

    const source = entry.source.getSourceFile();
    const { line, character } = source.getLineAndCharacterOfPosition(entry.source.getStart());
    diagnostics.push({
      code: "CDI-011",
      file: source.fileName,
      line: line + 1,
      column: character + 1,
      message: `UnusedBean: bean '${name}' is declared in scope but never referenced by another bean or \`expose\`.`,
      hint: "Remove the bean from `beans`, reference it from another bean's constructor, or add it to `expose`.",
    });
  }

  return diagnostics;
}
