import { describe, expect, it } from "vitest";

import * as api from "../../src/index";

describe("public API surface (clean-di)", () => {
  it("exports exactly the names listed in DESIGN §6.4", () => {
    const names = Object.keys(api).sort();
    expect(names).toEqual(["bean", "defineConfig", "defineContext", "provide"].sort());
  });

  it("does not leak internal markers (no BeanMarker, ProvideMarker, DefinedConfig values)", () => {
    expect((api as Record<string, unknown>).BeanMarker).toBeUndefined();
    expect((api as Record<string, unknown>).ProvideMarker).toBeUndefined();
    expect((api as Record<string, unknown>).DefinedConfig).toBeUndefined();
  });
});
