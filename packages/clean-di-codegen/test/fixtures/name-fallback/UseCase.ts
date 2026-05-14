import { Logger } from "./Logger";

export class UseCase {
  private readonly tag = "use-case";
  constructor(public readonly logger: Logger) {
    void this.tag;
  }
  run(): void {
    this.logger.log("running");
  }
}
