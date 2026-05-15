import { Logger } from "./Logger";

export class ServiceB {
  private readonly tag = "service-b";
  constructor(public readonly logger: Logger) {
    void this.tag;
  }
}
