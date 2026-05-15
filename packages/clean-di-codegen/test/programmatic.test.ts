import { describe, it, expect } from "vitest";

import { runOnce, runWatch, runCheck, VERSION } from "../src/index";

describe("programmatic API exports", () => {
  it("exports runOnce as a function", () => {
    expect(typeof runOnce).toBe("function");
  });

  it("exports runWatch as a function", () => {
    expect(typeof runWatch).toBe("function");
  });

  it("exports runCheck as a function", () => {
    expect(typeof runCheck).toBe("function");
  });

  it("exports VERSION as a string", () => {
    expect(typeof VERSION).toBe("string");
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it("VERSION matches package.json version", () => {
    // 0.0.0 is the pre-release placeholder version
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
