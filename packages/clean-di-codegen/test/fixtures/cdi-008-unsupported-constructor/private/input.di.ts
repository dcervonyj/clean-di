import { defineContext, bean } from "clean-di";

export class Factoryish {
  private readonly tag = "factoryish";
  private constructor() {
    void this.tag;
  }
  static create(): Factoryish {
    return new Factoryish();
  }
}

export const ctx = defineContext()({
  beans: {
    factoryish: bean(Factoryish),
  },
  expose: ["factoryish"] as const,
});
