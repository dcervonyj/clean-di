import { defineContext, bean } from "clean-di";

export class Variadic {
  private readonly tag = "variadic";
  constructor(...things: number[]) {
    void things;
    void this.tag;
  }
}

export const ctx = defineContext()({
  beans: {
    variadic: bean(Variadic),
  },
  expose: ["variadic"] as const,
});
