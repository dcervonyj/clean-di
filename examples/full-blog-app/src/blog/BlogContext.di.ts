import { defineContext, bean, provide } from "clean-di";

import { Logger } from "../shared/Logger.js";
import { lifecycleObserver } from "../shared/lifecycleObserver.js";

import type { BlogConfig } from "./BlogConfig.js";
import { commentsConfig } from "./comments/CommentsConfig.di.js";
import { CreatePostUseCase } from "./posts/CreatePostUseCase.js";
import { HttpPostsRepository } from "./posts/HttpPostsRepository.js";
import { ListPostsUseCase } from "./posts/ListPostsUseCase.js";
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
  // Async warm-up: yield a microtask so the runtime exercises the async
  // postConstruct path end-to-end. The observable side-effect is recorded on
  // `lifecycleObserver` so the example E2E test suite can assert it (T-100).
  postConstruct: async ({ logger }, cfg) => {
    await Promise.resolve();
    lifecycleObserver.warmedUp = true;
    logger.info(`blog ready — ${cfg.apiBaseUrl}`);
  },
  // Async teardown: yield a microtask before recording the observable side-
  // effect, so the runtime's async preDestroy path is exercised end-to-end.
  preDestroy: async ({ logger }, _cfg) => {
    await Promise.resolve();
    lifecycleObserver.tornDown = true;
    logger.info("blog destroyed");
  },
  expose: ["listPosts", "createPost", "listComments", "deleteComment", "getCurrentUser"],
});
