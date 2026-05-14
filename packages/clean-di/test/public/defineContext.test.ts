import { describe, expect, it } from "vitest";

import { bean } from "../../src/public/bean";
import { defineContext } from "../../src/public/defineContext";

class Logger {}

describe("defineContext()", () => {
  it("is curried — the outer call returns a function", () => {
    const factory = defineContext<{ apiUrl: string }>();
    expect(typeof factory).toBe("function");
  });

  it("returns a marker (typed as Container) when invoked with a spec", () => {
    const ctx = defineContext<{ apiUrl: string }>()({
      beans: {
        logger: bean(Logger),
      },
      expose: ["logger"] as const,
    });

    expect(ctx).toBeDefined();
    expect(typeof ctx.get).toBe("function");
    expect(typeof ctx.destroy).toBe("function");
    expect(typeof ctx.destroyAll).toBe("function");
  });

  it("get() throws with a regenerate-codegen message (fail-loud guard)", () => {
    const ctx = defineContext()({
      beans: { logger: bean(Logger) },
      expose: [] as const,
    });

    expect(() => ctx.get({})).toThrow(/clean-di-codegen/);
  });

  it("destroy() throws the same fail-loud message", () => {
    const ctx = defineContext()({
      beans: { logger: bean(Logger) },
      expose: [] as const,
    });

    expect(() => ctx.destroy()).toThrow(/clean-di-codegen/);
  });

  it("destroyAll() throws the same fail-loud message", () => {
    const ctx = defineContext()({
      beans: { logger: bean(Logger) },
      expose: [] as const,
    });

    expect(() => ctx.destroyAll()).toThrow(/clean-di-codegen/);
  });
});
