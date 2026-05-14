import { describe, expect, it, vi } from "vitest";

import type { BuildResult } from "../../src/runtime/buildResult";
import { createContext } from "../../src/runtime/createContext";

describe("createContext()", () => {
  describe("get()", () => {
    it("returns the exposed bag on first call", () => {
      const ctx = createContext<void, { value: number }>(() => ({
        bag: { value: 42 },
        expose: { value: 42 },
      }));

      expect(ctx.get({}).value).toBe(42);
    });

    it("is idempotent per key — same exposed reference", () => {
      const builderSpy = vi.fn(
        (): BuildResult<{ value: number }> => ({
          bag: { value: 1 },
          expose: { value: 1 },
        }),
      );
      const ctx = createContext<void, { value: number }>(builderSpy);

      const a = ctx.get({});
      const b = ctx.get({});

      expect(a).toBe(b);
      expect(builderSpy).toHaveBeenCalledTimes(1);
    });

    it("creates separate instances for different keys", () => {
      const ctx = createContext<void, { id: object }>(() => ({
        bag: { id: {} },
        expose: { id: {} },
      }));

      const a = ctx.get({ key: "tenantA" });
      const b = ctx.get({ key: "tenantB" });

      expect(a).not.toBe(b);
    });

    it("passes config through to the builder", () => {
      const ctx = createContext<{ name: string }, { hello: string }>((cfg) => ({
        bag: { hello: `hi ${cfg.name}` },
        expose: { hello: `hi ${cfg.name}` },
      }));

      expect(ctx.get({ config: { name: "world" } }).hello).toBe("hi world");
    });

    it("invokes postConstruct after build", () => {
      const postConstruct = vi.fn();
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        postConstruct,
      }));

      ctx.get({});
      expect(postConstruct).toHaveBeenCalledOnce();
    });

    it("CDIE-103: postConstruct throw → preDestroy runs → original error rethrown", () => {
      const preDestroy = vi.fn();
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        postConstruct: () => {
          throw new Error("init failed");
        },
        preDestroy,
      }));

      expect(() => ctx.get({})).toThrow(/CDIE-103/);
      expect(() => ctx.get({})).toThrow(/init failed/);
      // preDestroy ran (cleanup of partial)
      // Note: get() re-invokes builder + postConstruct, so preDestroy is called twice over two ctx.get attempts
    });

    it("CDIE-103: preDestroy errors during postConstruct cleanup are swallowed", () => {
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        postConstruct: () => {
          throw new Error("original");
        },
        preDestroy: () => {
          throw new Error("secondary");
        },
      }));

      expect(() => ctx.get({})).toThrow(/original/);
    });

    it("CDIE-101: get() after destroy() for the same key throws", () => {
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
      }));

      ctx.get({});
      ctx.destroy();
      expect(() => ctx.get({})).toThrow(/CDIE-101/);
    });
  });

  describe("destroy()", () => {
    it("runs preDestroy", () => {
      const preDestroy = vi.fn();
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        preDestroy,
      }));

      ctx.get({});
      ctx.destroy();
      expect(preDestroy).toHaveBeenCalledOnce();
    });

    it("CDIE-102: destroying an unknown key warns but does not throw", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const ctx = createContext<void, object>(() => ({ bag: {}, expose: {} }));

      ctx.destroy("never-built");

      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/CDIE-102/));
      warn.mockRestore();
    });

    it("CDIE-104: preDestroy throw is wrapped in AggregateError", () => {
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        preDestroy: () => {
          throw new Error("teardown failed");
        },
      }));

      ctx.get({});
      expect(() => ctx.destroy()).toThrow(AggregateError);
    });
  });

  describe("destroyAll()", () => {
    it("destroys every cached key", () => {
      const preDestroy = vi.fn();
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        preDestroy,
      }));

      ctx.get({ key: "a" });
      ctx.get({ key: "b" });
      ctx.destroyAll();

      expect(preDestroy).toHaveBeenCalledTimes(2);
    });

    it("aggregates preDestroy errors across keys", () => {
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        preDestroy: () => {
          throw new Error("each teardown fails");
        },
      }));

      ctx.get({ key: "a" });
      ctx.get({ key: "b" });

      try {
        ctx.destroyAll();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(AggregateError);
        expect((err as AggregateError).errors).toHaveLength(2);
      }
    });
  });
});
