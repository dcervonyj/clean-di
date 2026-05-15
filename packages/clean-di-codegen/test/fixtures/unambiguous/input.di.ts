import { defineContext, bean, provide } from "clean-di";

import { HttpPostsRepository } from "./HttpPostsRepository";
import { ListPostsUseCase } from "./ListPostsUseCase";
import { Logger } from "./Logger";

export interface PostsContextConfig {
  readonly apiBaseUrl: string;
}

export const postsContext = defineContext<PostsContextConfig>()({
  beans: {
    apiBaseUrl: provide<string>((cfg) => cfg.apiBaseUrl),
    logger: bean(Logger),
    postsRepository: bean(HttpPostsRepository),
    listPosts: bean(ListPostsUseCase),
  },
  expose: ["listPosts"] as const,
});
