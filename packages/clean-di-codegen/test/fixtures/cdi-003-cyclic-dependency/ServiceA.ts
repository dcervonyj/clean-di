import type { ServiceB } from "./ServiceB";

export class ServiceA {
  private readonly tag = "service-a";
  constructor(public readonly serviceB: ServiceB) {
    void this.tag;
  }
  doA(): void {
    void this.serviceB;
  }
}
