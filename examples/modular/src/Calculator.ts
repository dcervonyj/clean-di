import { Adder } from "./Adder.js";
import { Multiplier } from "./Multiplier.js";

export class Calculator {
  private readonly _adder: Adder;
  private readonly _multiplier: Multiplier;

  constructor(adder: Adder, multiplier: Multiplier) {
    this._adder = adder;
    this._multiplier = multiplier;
  }

  add(a: number, b: number): number {
    return this._adder.add(a, b);
  }

  multiply(a: number, b: number): number {
    return this._multiplier.multiply(a, b);
  }
}
