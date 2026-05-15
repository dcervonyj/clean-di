import type { Logger } from "./Logger";

export class UseCase {
  private readonly tag = "use-case";
  // Parameter name `audit` does NOT match either of the bean keys
  // (`primaryLogger`, `secondaryLogger`), so the name-fallback resolution
  // path can't disambiguate — the resolver must emit CDI-002.
  constructor(public readonly audit: Logger) {
    void this.tag;
  }
  run(): void {
    this.audit.log("running");
  }
}
