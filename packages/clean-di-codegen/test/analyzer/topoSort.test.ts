import { describe, expect, it } from "vitest";

import { topoSort } from "../../src/analyzer/topoSort";

function asGraph(map: Record<string, string[]>): Map<string, readonly string[]> {
  return new Map(Object.entries(map));
}

describe("topoSort()", () => {
  it("returns empty order for empty graph", () => {
    const result = topoSort({ graph: new Map() });
    expect(result.order).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("returns the linear order for a simple chain a -> b -> c", () => {
    const result = topoSort({
      graph: asGraph({
        a: ["b"],
        b: ["c"],
        c: [],
      }),
    });

    expect(result.order).not.toBeNull();
    const order = result.order!;
    // c must come before b; b must come before a
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("a"));
  });

  it("handles a diamond DAG", () => {
    // a -> b, a -> c, b -> d, c -> d
    const result = topoSort({
      graph: asGraph({
        a: ["b", "c"],
        b: ["d"],
        c: ["d"],
        d: [],
      }),
    });

    expect(result.order).not.toBeNull();
    const order = result.order!;
    expect(order.indexOf("d")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("d")).toBeLessThan(order.indexOf("c"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("a"));
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("a"));
  });

  it("detects a cycle of 2 and emits CDI-003", () => {
    const result = topoSort({
      graph: asGraph({
        a: ["b"],
        b: ["a"],
      }),
    });

    expect(result.order).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-003");
    expect(result.diagnostics[0]!.message).toMatch(/cycle/i);
  });

  it("detects a cycle of 3", () => {
    const result = topoSort({
      graph: asGraph({
        a: ["b"],
        b: ["c"],
        c: ["a"],
      }),
    });

    expect(result.order).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("CDI-003");
    expect(result.diagnostics[0]!.message).toMatch(/a.*b.*c|b.*c.*a|c.*a.*b/);
  });

  it("uses positions metadata for the diagnostic file/line/column", () => {
    const positions = new Map([
      ["a", { file: "x.di.ts", line: 14, column: 5 }],
      ["b", { file: "x.di.ts", line: 22, column: 5 }],
    ]);

    const result = topoSort({
      graph: asGraph({ a: ["b"], b: ["a"] }),
      positions,
    });

    expect(result.diagnostics[0]!.file).toBe("x.di.ts");
    expect(result.diagnostics[0]!.line).toBeGreaterThan(0);
  });
});
