import { describe, expect, it } from "vitest";

import { Greeter, sampleContext } from "../fixtures/runtime-tracer/SampleContext.di.generated";

describe("runtime tracer (T-025 — end-to-end smoke for the runtime)", () => {
  it("get() returns the exposed beans", () => {
    const exposed = sampleContext.get({ config: { prefix: "test" }, key: "get-returns-exposed" });

    expect(exposed.greeter).toBeInstanceOf(Greeter);
    expect(exposed.counter.value).toBe(1); // postConstruct ran greeter.init() which increments
  });

  it("get() is idempotent for the same key", () => {
    const a = sampleContext.get({ config: { prefix: "a" }, key: "idempotent-k1" });
    const b = sampleContext.get({ config: { prefix: "ignored" }, key: "idempotent-k1" });

    expect(a).toBe(b);
  });

  it("different keys produce independent instances", () => {
    const a = sampleContext.get({ config: { prefix: "t1" }, key: "scoping-tenantA" });
    const b = sampleContext.get({ config: { prefix: "t2" }, key: "scoping-tenantB" });

    expect(a.greeter).not.toBe(b.greeter);
    expect(a.counter).not.toBe(b.counter);
  });

  it("postConstruct fired (greeter.initialized = true)", () => {
    const exposed = sampleContext.get({ config: { prefix: "p" }, key: "pc-test" });

    expect(exposed.greeter.initialized).toBe(true);
  });

  it("destroy() runs preDestroy (greeter.disposed = true)", () => {
    const exposed = sampleContext.get({ config: { prefix: "p" }, key: "destroy-test" });
    expect(exposed.greeter.disposed).toBe(false);

    sampleContext.destroy("destroy-test");

    expect(exposed.greeter.disposed).toBe(true);
  });

  it("CDIE-101: get() after destroy() throws", () => {
    sampleContext.get({ config: { prefix: "p" }, key: "cdie101-test" });
    sampleContext.destroy("cdie101-test");

    expect(() => sampleContext.get({ config: { prefix: "p" }, key: "cdie101-test" })).toThrow(
      /CDIE-101/,
    );
  });

  it("destroyAll() tears down every cached instance", () => {
    const a = sampleContext.get({ config: { prefix: "a" }, key: "all-a" });
    const b = sampleContext.get({ config: { prefix: "b" }, key: "all-b" });

    expect(a.greeter.disposed).toBe(false);
    expect(b.greeter.disposed).toBe(false);

    sampleContext.destroyAll();

    expect(a.greeter.disposed).toBe(true);
    expect(b.greeter.disposed).toBe(true);
  });

  it("end-to-end: build → greet → destroy", () => {
    const exposed = sampleContext.get({ config: { prefix: "e2e" }, key: "e2e-test" });
    const message = exposed.greeter.greet("world");
    expect(message).toBe("hello, world (#1)");

    sampleContext.destroy("e2e-test");
    expect(exposed.greeter.disposed).toBe(true);
  });
});
