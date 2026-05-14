import { Logger } from "./Logger";

export class ServiceA {
  private readonly tag = "service-a";
  constructor(public readonly logger: Logger) {
    void this.tag;
  }
}
