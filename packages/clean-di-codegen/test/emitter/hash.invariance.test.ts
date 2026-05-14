import { describe, expect, it } from "vitest";

import { hashGeneratedFileWithBreakdown, type HashInputs } from "../../src/emitter/hash";

const baseline: HashInputs = {
  sourceFileContent: "export const x = 1;",
  constructorSignatures: ["constructor(a: number, b: string)"],
  generatorVersion: "1.0.0",
};

describe("hashGeneratedFile() invariance", () => {
  it("invalidates on source-file edit (only sourceFileHash flips)", () => {
    const before = hashGeneratedFileWithBreakdown(baseline);
    const after = hashGeneratedFileWithBreakdown({
      ...baseline,
      sourceFileContent: "export const x = 2;",
    });

    expect(after.combinedHash).not.toBe(before.combinedHash);
    expect(after.sourceFileHash).not.toBe(before.sourceFileHash);
    expect(after.constructorSignaturesHash).toBe(before.constructorSignaturesHash);
    expect(after.generatorVersionHash).toBe(before.generatorVersionHash);
  });

  it("invalidates on constructor-signature change (only constructorSignaturesHash flips)", () => {
    const before = hashGeneratedFileWithBreakdown(baseline);
    const after = hashGeneratedFileWithBreakdown({
      ...baseline,
      constructorSignatures: ["constructor(a: number, b: string, c: boolean)"],
    });

    expect(after.combinedHash).not.toBe(before.combinedHash);
    expect(after.constructorSignaturesHash).not.toBe(before.constructorSignaturesHash);
    expect(after.sourceFileHash).toBe(before.sourceFileHash);
    expect(after.generatorVersionHash).toBe(before.generatorVersionHash);
  });

  it("invalidates on generator-version bump (only generatorVersionHash flips)", () => {
    const before = hashGeneratedFileWithBreakdown(baseline);
    const after = hashGeneratedFileWithBreakdown({
      ...baseline,
      generatorVersion: "1.0.1",
    });

    expect(after.combinedHash).not.toBe(before.combinedHash);
    expect(after.generatorVersionHash).not.toBe(before.generatorVersionHash);
    expect(after.sourceFileHash).toBe(before.sourceFileHash);
    expect(after.constructorSignaturesHash).toBe(before.constructorSignaturesHash);
  });
});
