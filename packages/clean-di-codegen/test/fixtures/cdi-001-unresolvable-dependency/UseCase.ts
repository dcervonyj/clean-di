import type { Database } from "./Database";
import type { Logger } from "./Logger";

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
