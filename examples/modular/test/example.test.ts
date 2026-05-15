import { describe, it, expect, afterEach } from "vitest";

import { calcContext } from "../src/CalcContext.di.generated.js";
import { Calculator } from "../src/Calculator.js";

describe("examples/modular — calcContext", () => {
  afterEach(() => {
    calcContext.destroyAll();
  });

  it("resolves the calculator bean", () => {
    const { calculator } = calcContext.get({ config: { precision: 2 }, key: "t1" });
    expect(calculator).toBeInstanceOf(Calculator);
  });

  it("calculator.add() honours the precision config", () => {
    const { calculator } = calcContext.get({ config: { precision: 2 }, key: "t2" });
    expect(calculator.add(3.14159, 2.71828)).toBe(5.86);
  });

  it("calculator.multiply() honours the precision config", () => {
    const { calculator } = calcContext.get({ config: { precision: 3 }, key: "t3" });
    expect(calculator.multiply(2.5, 1.5)).toBe(3.75);
  });

  it("different precision values produce independent results", () => {
    const c0 = calcContext.get({ config: { precision: 0 }, key: "p0" });
    const c2 = calcContext.get({ config: { precision: 2 }, key: "p2" });
    expect(c0.calculator.add(1.1, 1.1)).toBe(2);
    expect(c2.calculator.add(1.1, 1.1)).toBe(2.2);
  });

  it("same key is idempotent", () => {
    const a = calcContext.get({ config: { precision: 2 }, key: "same" });
    const b = calcContext.get({ config: { precision: 2 }, key: "same" });
    expect(a.calculator).toBe(b.calculator);
  });
});
