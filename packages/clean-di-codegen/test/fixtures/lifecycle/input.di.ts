import { defineContext, bean } from "clean-di";

import { Greeter } from "./Greeter";
import { Logger } from "./Logger";

export const greeterContext = defineContext()({
  beans: {
    logger: bean(Logger),
    greeter: bean(Greeter),
  },
  postConstruct: ({ greeter }) => {
    greeter.init();
  },
  preDestroy: ({ greeter }) => {
    greeter.dispose();
  },
  expose: ["greeter"] as const,
});
