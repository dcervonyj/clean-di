import type { Logger } from "./Logger";

export class Greeter {
  private readonly tag = "Greeter";

  constructor(readonly logger: Logger) {
    void this.tag;
  }

  greet(name: string): void {
    this.logger.log(`Hello, ${name}!`);
  }
}
