import { Logger } from "./Logger";

export class Greeter {
  private readonly tag = "Greeter";

  constructor(
    readonly prefix: string,
    readonly logger: Logger,
  ) {
    void this.tag;
  }

  greet(name: string): string {
    return `${this.prefix} ${name}`;
  }
}
