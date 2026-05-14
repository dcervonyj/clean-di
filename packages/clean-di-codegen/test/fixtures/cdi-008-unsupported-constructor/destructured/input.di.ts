import { defineContext, bean } from "clean-di";

export class Destructured {
  private readonly tag = "destructured";
  constructor({ x, y }: { x: number; y: number }) {
    void x;
    void y;
    void this.tag;
  }
}

export const ctx = defineContext()({
  beans: {
    destructured: bean(Destructured),
  },
  expose: ["destructured"] as const,
});
