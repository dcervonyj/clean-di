export class Adder {
  private readonly precision: number;

  constructor(precision: number) {
    this.precision = precision;
  }

  add(a: number, b: number): number {
    return parseFloat((a + b).toFixed(this.precision));
  }
}
