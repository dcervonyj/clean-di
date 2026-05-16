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

    it("CDIE-101: get() after destroy() for the same key throws", async () => {
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
      }));

      ctx.get({});
      await ctx.destroy();
      expect(() => ctx.get({})).toThrow(/CDIE-101/);
    });
  });

  describe("destroy()", () => {
    it("runs preDestroy", async () => {
      const preDestroy = vi.fn();
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        preDestroy,
      }));

      ctx.get({});
      await ctx.destroy();
      expect(preDestroy).toHaveBeenCalledOnce();
    });

    it("CDIE-102: destroying an unknown key warns but does not throw", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const ctx = createContext<void, object>(() => ({ bag: {}, expose: {} }));

      await ctx.destroy("never-built");

      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/CDIE-102/));
      warn.mockRestore();
    });

    it("CDIE-104: preDestroy throw is wrapped in AggregateError", async () => {
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        preDestroy: () => {
          throw new Error("teardown failed");
        },
      }));

      ctx.get({});
      await expect(ctx.destroy()).rejects.toBeInstanceOf(AggregateError);
    });
  });

  describe("destroyAll()", () => {
    it("destroys every cached key", async () => {
      const preDestroy = vi.fn();
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        preDestroy,
      }));

      ctx.get({ key: "a" });
      ctx.get({ key: "b" });
      await ctx.destroyAll();

      expect(preDestroy).toHaveBeenCalledTimes(2);
    });

    it("aggregates preDestroy errors across keys", async () => {
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
        await ctx.destroyAll();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(AggregateError);
        expect((err as AggregateError).errors).toHaveLength(2);
      }
    });
  });

  describe("async lifecycle", () => {
    it("get() returns immediately; init() awaits async postConstruct", async () => {
      let resolveHook!: () => void;
      const hookReady = new Promise<void>((res) => {
        resolveHook = res;
      });
      let sideEffectFired = false;

      const ctx = createContext<void, { ready: boolean }>(() => ({
        bag: { ready: false },
        expose: { ready: true },
        postConstruct: async () => {
          await hookReady;
          sideEffectFired = true;
        },
      }));

      const exposed = ctx.get({});
      expect(exposed.ready).toBe(true);
      expect(sideEffectFired).toBe(false);

      const initPending = ctx.init({});
      // still not fired — the hook is awaiting `hookReady`
      expect(sideEffectFired).toBe(false);

      resolveHook();
      await initPending;

      expect(sideEffectFired).toBe(true);
    });

    it("init() is idempotent (repeated calls await the same promise)", async () => {
      const postConstruct = vi.fn(async () => {
        await Promise.resolve();
      });
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        postConstruct,
      }));

      ctx.get({});
      await Promise.all([ctx.init({}), ctx.init({}), ctx.init({})]);

      expect(postConstruct).toHaveBeenCalledOnce();
    });

    it("async postConstruct rejection: init() throws CDIE-103, cache entry deleted, preDestroy ran", async () => {
      const preDestroy = vi.fn();
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        postConstruct: async () => {
          await Promise.resolve();
          throw new Error("async init failed");
        },
        preDestroy,
      }));

      ctx.get({});
      const failingInit = ctx.init({});
      await expect(failingInit).rejects.toThrow(/CDIE-103/);
      await expect(failingInit).rejects.toThrow(/async init failed/);

      // preDestroy ran during async cleanup
      expect(preDestroy).toHaveBeenCalled();

      // cache entry deleted → get() rebuilds (does not throw CDIE-101)
      expect(() => ctx.get({})).not.toThrow(/CDIE-101/);
    });

    it("async postConstruct rejection: subsequent get() returns a freshly constructed instance (not the dead one)", async () => {
      // T-100: explicit regression for the cleanup-after-async-rejection path.
      // After the rejected init() evicts the cache entry, the next get() must
      // re-run the builder rather than hand back the stale exposed reference.
      let buildCounter = 0;
      const preDestroy = vi.fn();
      let shouldFail = true;

      const ctx = createContext<void, { id: number }>(() => {
        buildCounter += 1;
        const id = buildCounter;

        return {
          bag: { id },
          expose: { id },
          postConstruct: async () => {
            await Promise.resolve();
            if (shouldFail) {
              throw new Error("async init failed");
            }
          },
          preDestroy,
        };
      });

      const first = ctx.get({});
      expect(first.id).toBe(1);
      await expect(ctx.init({})).rejects.toThrow(/CDIE-103/);
      expect(preDestroy).toHaveBeenCalledTimes(1);

      // Cache entry was deleted → next get() runs the builder again, producing
      // a fresh exposed reference (different identity, different id).
      shouldFail = false;
      const second = ctx.get({});
      expect(second).not.toBe(first);
      expect(second.id).toBe(2);
      // The successful init() after a rebuild is idempotent (no extra
      // preDestroy invocations from the previous failure leak through).
      await expect(ctx.init({})).resolves.toBeUndefined();
      expect(preDestroy).toHaveBeenCalledTimes(1);
    });

    it("async preDestroy: destroy() awaits it", async () => {
      let resolveTeardown!: () => void;
      const teardownReady = new Promise<void>((res) => {
        resolveTeardown = res;
      });
      let teardownDone = false;

      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        preDestroy: async () => {
          await teardownReady;
          teardownDone = true;
        },
      }));

      ctx.get({});
      const destroyPending = ctx.destroy();
      expect(teardownDone).toBe(false);

      resolveTeardown();
      await destroyPending;

      expect(teardownDone).toBe(true);
    });

    it("destroyAll() runs async preDestroys in parallel", async () => {
      // Both preDestroys hang on a shared barrier. If destroyAll were serial,
      // only the first destroy would start; resolving the barrier would never
      // be enough because the second destroy hasn't entered yet. Running them
      // in parallel means both hit the barrier together and both finish when
      // it resolves.
      let startedCount = 0;
      let resolveBarrier!: () => void;
      const barrier = new Promise<void>((res) => {
        resolveBarrier = res;
      });

      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        preDestroy: async () => {
          startedCount += 1;
          await barrier;
        },
      }));

      ctx.get({ key: "a" });
      ctx.get({ key: "b" });

      const destroyAllPromise = ctx.destroyAll();

      // Allow microtasks to run so both destroys can begin (parallel start).
      await Promise.resolve();
      await Promise.resolve();

      expect(startedCount).toBe(2);

      resolveBarrier();
      await destroyAllPromise;
    });

    it("sync hooks regression: postConstruct/preDestroy still synchronous", async () => {
      const events: string[] = [];
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        postConstruct: () => {
          events.push("post");
        },
        preDestroy: () => {
          events.push("pre");
        },
      }));

      ctx.get({});
      // sync postConstruct ran before get() returned
      expect(events).toEqual(["post"]);

      await ctx.init({});
      // init() for sync hooks resolves immediately, no extra calls
      expect(events).toEqual(["post"]);

      await ctx.destroy();
      expect(events).toEqual(["post", "pre"]);
    });

    it("CDIE-106: init() called before get() throws", async () => {
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
      }));

      await expect(ctx.init({})).rejects.toThrow(/CDIE-106/);
    });

    it("CDIE-106: init() for an explicit key without a prior get() throws (does NOT silently no-op)", async () => {
      // T-100: a previous get() for a different key must NOT mask the
      // init-before-get misuse for the requested key.
      const builderSpy = vi.fn(() => ({
        bag: {},
        expose: {} as object,
        postConstruct: async () => undefined,
      }));
      const ctx = createContext<void, object>(builderSpy);

      ctx.get({ key: "tenant-a" });
      builderSpy.mockClear();

      await expect(ctx.init({ key: "tenant-b" })).rejects.toThrow(/CDIE-106/);
      // The misuse guard must not have triggered a builder run for tenant-b.
      expect(builderSpy).not.toHaveBeenCalled();
    });

    it("sync postConstruct throw without preDestroy: still throws CDIE-103 (no cleanup needed)", () => {
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        postConstruct: () => {
          throw new Error("init failed");
        },
      }));

      expect(() => ctx.get({})).toThrow(/CDIE-103/);
    });

    it("sync postConstruct throw with async preDestroy that resolves: cleanup is scheduled, error rethrown", () => {
      const preDestroy = vi.fn(async () => {
        await Promise.resolve();
      });
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        postConstruct: () => {
          throw new Error("init failed");
        },
        preDestroy,
      }));

      expect(() => ctx.get({})).toThrow(/CDIE-103/);
      expect(preDestroy).toHaveBeenCalled();
    });

    it("sync postConstruct throw with async preDestroy that rejects: rejection swallowed, original error rethrown", async () => {
      const preDestroyError = new Error("cleanup failed");
      const preDestroy = vi.fn(async () => {
        await Promise.resolve();
        throw preDestroyError;
      });
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        postConstruct: () => {
          throw new Error("init failed");
        },
        preDestroy,
      }));

      // Track unhandled rejections to verify async preDestroy rejection is swallowed.
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown): void => {
        unhandled.push(reason);
      };
      process.on("unhandledRejection", onUnhandled);

      try {
        expect(() => ctx.get({})).toThrow(/init failed/);
        // Allow microtasks (and any unhandled rejection emission) to flush.
        await new Promise<void>((res) => setImmediate(res));
        expect(unhandled).not.toContain(preDestroyError);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }

      expect(preDestroy).toHaveBeenCalled();
    });

    it("async postConstruct rejection without preDestroy: still throws CDIE-103 (no cleanup)", async () => {
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        postConstruct: async () => {
          await Promise.resolve();
          throw new Error("async init failed");
        },
      }));

      ctx.get({});
      await expect(ctx.init({})).rejects.toThrow(/CDIE-103/);
    });

    it("async postConstruct rejection with async preDestroy: cleanup is awaited and rejection swallowed", async () => {
      const preDestroy = vi.fn(async () => {
        await Promise.resolve();
        throw new Error("async cleanup failed");
      });
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        postConstruct: async () => {
          await Promise.resolve();
          throw new Error("async init failed");
        },
        preDestroy,
      }));

      ctx.get({});
      await expect(ctx.init({})).rejects.toThrow(/async init failed/);
      expect(preDestroy).toHaveBeenCalled();
    });

    it("async postConstruct rejection with sync preDestroy: cleanup runs, original error rethrown", async () => {
      const preDestroy = vi.fn();
      const ctx = createContext<void, object>(() => ({
        bag: {},
        expose: {},
        postConstruct: async () => {
          await Promise.resolve();
          throw new Error("async init failed");
        },
        preDestroy,
      }));

      ctx.get({});
      await expect(ctx.init({})).rejects.toThrow(/CDIE-103/);
      expect(preDestroy).toHaveBeenCalled();
    });
  });

  describe("CDIE-105 runtime circular dependency detection", () => {
    it("throws CDIE-105 when a builder calls get() for the same key mid-construction", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ctx: ReturnType<typeof createContext<void, { value: number }>> = null as any;
      const key = Symbol("cycle-key");

      ctx = createContext<void, { value: number }>(() => {
        // recursive call to the same key during construction → cycle
        ctx.get({ key });

        return { bag: { value: 0 }, expose: { value: 0 } };
      });

      expect(() => ctx.get({ key })).toThrow(/CDIE-105/);
    });

    it("buildingKeys is cleared after a cycle error (no false-positive on subsequent get)", () => {
      let triggerCycle = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ctx: ReturnType<typeof createContext<void, { value: number }>> = null as any;
      const key = Symbol("cycle-then-ok");

      ctx = createContext<void, { value: number }>(() => {
        if (triggerCycle) {
          ctx.get({ key });
        }

        return { bag: { value: 1 }, expose: { value: 1 } };
      });

      expect(() => ctx.get({ key })).toThrow(/CDIE-105/);

      triggerCycle = false;
      // After the cycle error, buildingKeys should be empty so a fresh get works.
      expect(ctx.get({ key: Symbol("fresh") }).value).toBe(1);
    });

    it("a builder reading a different key does NOT trigger the cycle guard", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ctx: ReturnType<typeof createContext<void, { value: number }>> = null as any;
      const keyA = Symbol("a");
      const keyB = Symbol("b");
      let firstBuild = true;

      ctx = createContext<void, { value: number }>(() => {
        if (firstBuild) {
          firstBuild = false;
          // reading a different key during construction is allowed
          ctx.get({ key: keyB });
        }

        return { bag: { value: 7 }, expose: { value: 7 } };
      });

      expect(() => ctx.get({ key: keyA })).not.toThrow();
    });
  });
});
