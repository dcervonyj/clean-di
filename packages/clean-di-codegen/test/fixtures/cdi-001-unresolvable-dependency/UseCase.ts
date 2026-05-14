import { Logger } from "./Logger";
import { Database } from "./Database";

export class UseCase {
  private readonly tag = "use-case";
  constructor(
    public readonly logger: Logger,
    public readonly database: Database,
  ) {
    void this.tag;
  }
  run(): void {
    this.logger.log("running");
    void this.database;
  }
}
