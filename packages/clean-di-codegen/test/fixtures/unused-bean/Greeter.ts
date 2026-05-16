import type { Logger } from "./Logger";

export class Greeter {
  constructor(private readonly logger: Logger) {}

  greet(): string {
    this.logger.log("hello");

    return "hello";
  }
}
