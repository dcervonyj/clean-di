import { defineContext, bean, provide } from "clean-di";

import type { BlogConfig } from "./BlogConfig.js";
import { Logger } from "../shared/Logger.js";
import { HttpPostsRepository } from "./posts/HttpPostsRepository.js";
import { ListPostsUseCase } from "./posts/ListPostsUseCase.js";
import { CreatePostUseCase } from "./posts/CreatePostUseCase.js";
import { commentsConfig } from "./comments/CommentsConfig.di.js";
import { usersConfig } from "./users/UsersConfig.di.js";

export type { BlogConfig };

export const blogContext = defineContext<BlogConfig>()({
  imports: [commentsConfig, usersConfig],
  beans: {
    // Synthetic config beans handle `apiBaseUrl` and `authToken` automatically
    // (any BlogConfig field is available as a bean by name). Only `logger`
    // needs an explicit provide() because it has no matching config field.
    logger: provide(() => new Logger("blog")),

    postsRepository: bean(HttpPostsRepository),
    listPosts: bean(ListPostsUseCase),
    createPost: bean(CreatePostUseCase),
  },
  postConstruct: ({ logger }, cfg) => logger.info(`blog ready — ${cfg.apiBaseUrl}`),
  preDestroy: ({ logger }, _cfg) => logger.info("blog destroyed"),
  expose: [
    "listPosts",
    "createPost",
    "listComments",
    "deleteComment",
    "getCurrentUser",
  ],
});
