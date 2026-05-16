import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { createContext } from "../../src/runtime/createContext";
import { createScope } from "../../src/runtime/createScope";

describe("createScope()", () => {
  it("exposes parent beans plus child beans on the merged expose object", () => {
    const parent = createContext<void, { logger: { log: (m: string) => void } }>(() => ({
      bag: { logger: { log: () => undefined } },
      expose: { logger: { log: () => undefined } },
    }));
    const parentBeans = parent.get({});

    const scope = createScope(parentBeans, (app) => {
      const requestId = "req-1";
      const currentUser = { id: 42, log: app.logger.log };

      return {
        bag: { requestId, currentUser },
        expose: { requestId, currentUser },
      };
    });

    const exposed = scope.get({});

    expect(exposed.logger).toBe(parentBeans.logger);
    expect(exposed.requestId).toBe("req-1");
    expect(exposed.currentUser.id).toBe(42);
  });

  it("destroying the child does NOT destroy the parent", async () => {
    const parentPreDestroy = vi.fn();
    const parent = createContext<void, { value: number }>(() => ({
      bag: { value: 1 },
      expose: { value: 1 },
      preDestroy: parentPreDestroy,
    }));
    const parentBeans = parent.get({});

    const childPreDestroy = vi.fn();
    const scope = createScope(parentBeans, () => ({
      bag: { childValue: 2 },
      expose: { childValue: 2 },
      preDestroy: childPreDestroy,
    }));

    scope.get({});
    await scope.destroy();

    expect(childPreDestroy).toHaveBeenCalledOnce();
    expect(parentPreDestroy).not.toHaveBeenCalled();

    // Parent is still usable.
    expect(parent.get({}).value).toBe(1);
  });

  it("can be instantiated multiple times with different keys (independent child instances)", () => {
    const parent = createContext<void, { shared: object }>(() => {
      const shared = { id: "shared" };

      return { bag: { shared }, expose: { shared } };
    });
    const parentBeans = parent.get({});

    let counter = 0;
    const scope = createScope(parentBeans, () => {
      counter += 1;
      const instanceId = counter;

      return {
        bag: { instanceId },
        expose: { instanceId },
      };
    });

    const a = scope.get({ key: "req-a" });
    const b = scope.get({ key: "req-b" });

    expect(a.shared).toBe(b.shared); // parent bean is identity-shared
    expect(a.instanceId).not.toBe(b.instanceId); // child beans differ per key
  });

  it("runs child postConstruct and preDestroy", async () => {
    const postConstruct = vi.fn();
    const preDestroy = vi.fn();
    const parent = createContext<void, { p: number }>(() => ({
      bag: { p: 7 },
      expose: { p: 7 },
    }));
    const parentBeans = parent.get({});

    const scope = createScope(parentBeans, () => ({
      bag: { c: 1 },
      expose: { c: 1 },
      postConstruct,
      preDestroy,
    }));

    scope.get({});
    expect(postConstruct).toHaveBeenCalledOnce();

    await scope.destroy();
    expect(preDestroy).toHaveBeenCalledOnce();
  });

  it("supports async lifecycle on the child (init() awaits async postConstruct)", async () => {
    const parent = createContext<void, { p: number }>(() => ({
      bag: { p: 7 },
      expose: { p: 7 },
    }));
    const parentBeans = parent.get({});

    let resolveHook!: () => void;
    const hookReady = new Promise<void>((res) => {
      resolveHook = res;
    });
    let sideEffect = false;

    const scope = createScope(parentBeans, () => ({
      bag: { c: 1 },
      expose: { c: 1 },
      postConstruct: async () => {
        await hookReady;
        sideEffect = true;
      },
    }));

    scope.get({});
    expect(sideEffect).toBe(false);

    const initPending = scope.init({});
    resolveHook();
    await initPending;

    expect(sideEffect).toBe(true);
  });

  it("child's exposed type is TParentExposed & TScoped (compile-time)", () => {
    const parent = createContext<void, { logger: { tag: string } }>(() => ({
      bag: { logger: { tag: "p" } },
      expose: { logger: { tag: "p" } },
    }));
    const parentBeans = parent.get({});

    const scope = createScope(parentBeans, () => ({
      bag: { requestId: "abc" },
      expose: { requestId: "abc" },
    }));

    const exposed = scope.get({});

    // Compile-time assertion: the merged exposed type carries both parent and child fields.
    expectTypeOf(exposed).toEqualTypeOf<{
      logger: { tag: string };
      requestId: string;
    }>();

    // Runtime sanity
    expect(exposed.logger.tag).toBe("p");
    expect(exposed.requestId).toBe("abc");
  });
});
