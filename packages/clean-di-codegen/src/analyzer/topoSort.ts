import type { Diagnostic } from "../diagnostics/codes.js";

export interface TopoSortInput {
  /** Map from bean name to the ordered list of bean names it depends on. */
  readonly graph: ReadonlyMap<string, readonly string[]>;
  /**
   * Optional source-position metadata for diagnostics. Mapped by bean name.
   * Used when emitting CDI-003 so the cycle diagnostic points back to a real
   * line in the .di.ts file. Falls back to "unknown" when absent.
   */
  readonly positions?: ReadonlyMap<
    string,
    { readonly file: string; readonly line: number; readonly column: number }
  >;
}

export interface TopoSortResult {
  /** The beans in dependency-first order, or null if a cycle was detected. */
  readonly order: readonly string[] | null;
  /** Diagnostics collected during sort. Empty unless cycles were detected. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Topologically sort the bean graph using iterative DFS with three-state
 * coloring. Returns the order on success; on cycle, returns `null` and a
 * `CDI-003 CyclicDependency` diagnostic naming the nodes in the cycle.
 */
export function topoSort(input: TopoSortInput): TopoSortResult {
  const { graph, positions } = input;
  const WHITE = 0; // unvisited
  const GREY = 1; // in the current DFS path
  const BLACK = 2; // fully processed

  const color = new Map<string, number>();
  for (const name of graph.keys()) {
    color.set(name, WHITE);
  }

  const order: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const stack: { node: string; depIndex: number; path: string[] }[] = [];

  for (const startNode of graph.keys()) {
    if (color.get(startNode) !== WHITE) continue;

    stack.push({ node: startNode, depIndex: 0, path: [startNode] });
    color.set(startNode, GREY);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const deps = graph.get(frame.node) ?? [];

      if (frame.depIndex >= deps.length) {
        // Done with this node — finalize.
        color.set(frame.node, BLACK);
        order.push(frame.node);
        stack.pop();
        continue;
      }

      const next = deps[frame.depIndex]!;
      frame.depIndex += 1;

      const nextColor = color.get(next) ?? WHITE;
      if (nextColor === BLACK) {
        continue; // already finalized — fine
      }
      if (nextColor === GREY) {
        // Cycle: trace it from the start of GREY along the current path.
        const cycleStart = frame.path.indexOf(next);
        const cycle = cycleStart >= 0 ? frame.path.slice(cycleStart) : frame.path.slice();
        cycle.push(next);

        const pos = positions?.get(next) ?? { file: "unknown", line: 1, column: 1 };
        diagnostics.push({
          code: "CDI-003",
          file: pos.file,
          line: pos.line,
          column: pos.column,
          message: `CyclicDependency: cycle detected through beans ${cycle.join(" -> ")}.`,
          hint: "Refactor to break the cycle, or extract the shared state into a third bean.",
        });

        return { order: null, diagnostics };
      }

      // WHITE — recurse.
      color.set(next, GREY);
      stack.push({ node: next, depIndex: 0, path: [...frame.path, next] });
    }
  }

  return { order, diagnostics };
}
