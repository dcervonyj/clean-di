export class Multiplier {
  private readonly precision: number;

  constructor(precision: number) {
    this.precision = precision;
  }

  multiply(a: number, b: number): number {
    return parseFloat((a * b).toFixed(this.precision));
  }
}
