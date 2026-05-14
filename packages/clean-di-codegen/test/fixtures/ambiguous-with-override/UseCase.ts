import { MainLogger } from "./MainLogger";

export class UseCase {
  private readonly tag = "use-case";
  constructor(public readonly logger: MainLogger) {
    void this.tag;
  }
  run(): void {
    this.logger.log("running");
  }
}
