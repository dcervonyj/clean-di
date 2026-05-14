import { HttpCommentsRepository } from "./HttpCommentsRepository.js";
import type { Comment } from "./Comment.js";

export class ListCommentsUseCase {
  constructor(private readonly repo: HttpCommentsRepository) {}

  async execute(postId: number): Promise<Comment[]> {
    return this.repo.list(postId);
  }
}
