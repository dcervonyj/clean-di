import { describe, expect, it } from "vitest";

import { bean, type BeanMarker } from "../../src/public/bean";

class Logger {
  log(): string {
    return "ok";
  }
}

class Repository {
  constructor(public readonly logger: Logger) {}
}

describe("bean()", () => {
  it("returns a marker with kind 'bean', the Class reference, and empty overrides", () => {
    const def = bean(Logger) as BeanMarker<Logger>;

    expect(def.kind).toBe("bean");
    expect(def.Class).toBe(Logger);
    expect(def.overrides).toEqual({});
  });

  it("stores the overrides map when provided", () => {
    const def = bean(Repository, { logger: "myLogger" }) as BeanMarker<Repository>;

    expect(def.overrides).toEqual({ logger: "myLogger" });
  });

  it("InstanceType inference allows construction from the marker (for hand-written fixtures)", () => {
    const def = bean(Logger) as BeanMarker<Logger>;
    const instance = new def.Class();
    expect(instance.log()).toBe("ok");
  });
});
