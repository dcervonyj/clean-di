import type { Logger } from "./Logger.js";

export class Greeter {
  constructor(
    private readonly logger: Logger,
    private readonly name: string,
  ) {}

  greet(): string {
    const message = `Hello, ${this.name}!`;
    this.logger.info(message);
    return message;
  }
}
