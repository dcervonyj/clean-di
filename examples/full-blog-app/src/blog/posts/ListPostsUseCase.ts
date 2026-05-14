import { HttpPostsRepository } from "./HttpPostsRepository.js";
import type { Post } from "./Post.js";

export class ListPostsUseCase {
  constructor(private readonly repo: HttpPostsRepository) {}

  async execute(): Promise<Post[]> {
    return this.repo.list();
  }
}
