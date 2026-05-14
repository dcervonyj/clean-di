import { calcContext } from "./CalcContext.di.generated.js";

const container = calcContext.get({ config: { precision: 2 } });

console.log("3.14 + 2.71 =", container.calculator.add(3.14, 2.71));
console.log("2.5 × 1.5 =", container.calculator.multiply(2.5, 1.5));
