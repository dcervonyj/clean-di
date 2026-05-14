import { describe, it, expect, vi, afterEach } from "vitest";
import { greeterContext } from "../src/GreeterContext.di.generated.js";
import { Greeter } from "../src/Greeter.js";

describe("examples/basic — greeterContext", () => {
  afterEach(() => { greeterContext.destroyAll(); });

  it("resolves the greeter bean with the configured name", () => {
    const { greeter } = greeterContext.get({ config: { name: "World" }, key: "t1" });
    expect(greeter).toBeInstanceOf(Greeter);
  });

  it("greeter.greet() returns the expected message", () => {
    const { greeter } = greeterContext.get({ config: { name: "Alice" }, key: "t2" });
    expect(greeter.greet()).toBe("Hello, Alice!");
  });

  it("greeter.greet() calls logger.info with the message", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { greeter } = greeterContext.get({ config: { name: "Bob" }, key: "t3" });
      greeter.greet();
      expect(spy).toHaveBeenCalledWith("[INFO] Hello, Bob!");
    } finally {
      spy.mockRestore();
    }
  });

  it("different config keys produce separate instances", () => {
    const a = greeterContext.get({ config: { name: "A" }, key: "a" });
    const b = greeterContext.get({ config: { name: "B" }, key: "b" });
    expect(a.greeter).not.toBe(b.greeter);
    expect(a.greeter.greet()).toBe("Hello, A!");
    expect(b.greeter.greet()).toBe("Hello, B!");
  });

  it("same key returns the same cached instance", () => {
    const first = greeterContext.get({ config: { name: "Cached" }, key: "c" });
    const second = greeterContext.get({ config: { name: "Cached" }, key: "c" });
    expect(first.greeter).toBe(second.greeter);
  });
});
