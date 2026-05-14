import type { Logger } from "./Logger";

export class Greeter {
  private readonly tag = "greeter";

  constructor(private readonly logger: Logger) {
    void this.tag;
  }

  init(): void {
    this.logger.log(`init ${this.tag}`);
  }

  dispose(): void {
    this.logger.log(`dispose ${this.tag}`);
  }
}
