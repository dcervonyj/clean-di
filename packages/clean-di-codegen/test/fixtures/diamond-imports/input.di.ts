import { defineContext } from "clean-di";

import { aConfig } from "./aConfig";
import { bConfig } from "./bConfig";

export const appContext = defineContext()({
  imports: [aConfig, bConfig],
  beans: {},
  expose: ["serviceA", "serviceB"] as const,
});
