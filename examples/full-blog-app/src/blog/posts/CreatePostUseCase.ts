import type { HttpPostsRepository } from "./HttpPostsRepository.js";
import type { Post } from "./Post.js";

export class CreatePostUseCase {
  constructor(private readonly repo: HttpPostsRepository) {}

  async execute(title: string, body: string): Promise<Post> {
    return this.repo.create(title, body);
  }
}
