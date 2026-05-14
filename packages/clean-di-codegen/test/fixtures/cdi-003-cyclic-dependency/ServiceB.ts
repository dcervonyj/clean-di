import type { ServiceA } from "./ServiceA";

export class ServiceB {
  private readonly tag = "service-b";
  constructor(public readonly serviceA: ServiceA) {
    void this.tag;
  }
  doB(): void {
    void this.serviceA;
  }
}
