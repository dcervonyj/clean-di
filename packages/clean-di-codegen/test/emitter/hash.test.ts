import { describe, expect, it } from "vitest";

import { hashGeneratedFile, type HashInputs } from "../../src/emitter/hash";

const baseline: HashInputs = {
  sourceFileContent: "export const x = 1;",
  constructorSignatures: ["constructor(a: number, b: string)"],
  generatorVersion: "1.0.0",
};

describe("hashGeneratedFile()", () => {
  it("is deterministic on identical inputs", () => {
    expect(hashGeneratedFile(baseline)).toBe(hashGeneratedFile(baseline));
  });

  it("returns a 64-character lowercase hex string (SHA-256)", () => {
    const h = hashGeneratedFile(baseline);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when sourceFileContent changes", () => {
    const a = hashGeneratedFile(baseline);
    const b = hashGeneratedFile({ ...baseline, sourceFileContent: "export const x = 2;" });
    expect(a).not.toBe(b);
  });

  it("changes when constructorSignatures change", () => {
    const a = hashGeneratedFile(baseline);
    const b = hashGeneratedFile({
      ...baseline,
      constructorSignatures: ["constructor(a: number, b: string, c: boolean)"],
    });
    expect(a).not.toBe(b);
  });

  it("changes when generatorVersion changes", () => {
    const a = hashGeneratedFile(baseline);
    const b = hashGeneratedFile({ ...baseline, generatorVersion: "1.0.1" });
    expect(a).not.toBe(b);
  });

  it("treats reordered constructor signatures as different inputs (order is significant)", () => {
    const a = hashGeneratedFile({
      ...baseline,
      constructorSignatures: ["constructor(a)", "constructor(b)"],
    });
    const b = hashGeneratedFile({
      ...baseline,
      constructorSignatures: ["constructor(b)", "constructor(a)"],
    });
    expect(a).not.toBe(b);
  });
});
