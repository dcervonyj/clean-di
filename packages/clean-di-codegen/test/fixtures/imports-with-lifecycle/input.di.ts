import { defineContext, bean } from "clean-di";

import { Greeter } from "./Greeter";
import { helperConfig } from "./helperConfig";

export const appContext = defineContext()({
  beans: {
    greeter: bean(Greeter),
  },
  imports: [helperConfig],
  postConstruct: ({ greeter }: { greeter: Greeter }) => {
    greeter.greet("world");
  },
  preDestroy: ({ greeter }: { greeter: Greeter }) => {
    greeter.logger.log("app:preDestroy");
  },
  expose: ["greeter"] as const,
});
