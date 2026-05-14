import { describe, expect, it } from "vitest";

import { provide, type ProvideMarker } from "../../src/public/provide";

describe("provide()", () => {
  it("returns a marker with kind 'provide' and the factory reference", () => {
    const factory = (cfg: { apiBaseUrl: string }) => cfg.apiBaseUrl;
    const def = provide(factory) as ProvideMarker<string>;

    expect(def.kind).toBe("provide");
    expect(def.factory).toBe(factory);
  });

  it("factory result is correctly typed at runtime", () => {
    const def = provide(() => 42) as ProvideMarker<number>;
    expect(def.factory(undefined as never)).toBe(42);
  });

  it("preserves identity of the factory closure (codegen reads it from AST)", () => {
    const factory = () => ({ x: 1 });
    const def = provide(factory) as ProvideMarker<{ x: number }>;
    expect(def.factory).toBe(factory);
  });
});
