import { defineConfig, bean } from "clean-di";

import { HttpCommentsRepository } from "./HttpCommentsRepository";
import { ListCommentsUseCase } from "./ListCommentsUseCase";

export const commentsConfig = defineConfig({
  beans: {
    commentsRepository: bean(HttpCommentsRepository),
    listComments: bean(ListCommentsUseCase),
  },
});
