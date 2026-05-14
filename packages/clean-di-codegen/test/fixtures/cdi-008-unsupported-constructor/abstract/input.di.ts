import { defineContext, bean } from "clean-di";

export abstract class AbstractThing {
  private readonly tag = "abstract-thing";
  constructor() {
    void this.tag;
  }
  abstract run(): void;
}

export const ctx = defineContext()({
  beans: {
    abstractThing: bean(AbstractThing),
  },
  expose: ["abstractThing"] as const,
});
