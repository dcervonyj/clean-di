import { defineConfig, bean } from "clean-di";

import { DeleteCommentUseCase } from "./DeleteCommentUseCase.js";
import { HttpCommentsRepository } from "./HttpCommentsRepository.js";
import { ListCommentsUseCase } from "./ListCommentsUseCase.js";

export const commentsConfig = defineConfig({
  beans: {
    commentsRepository: bean(HttpCommentsRepository),
    listComments: bean(ListCommentsUseCase),
    deleteComment: bean(DeleteCommentUseCase),
  },
});
