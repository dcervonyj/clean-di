import type { HttpCommentsRepository } from "./HttpCommentsRepository.js";

export class DeleteCommentUseCase {
  constructor(private readonly repo: HttpCommentsRepository) {}

  async execute(id: number): Promise<void> {
    return this.repo.delete(id);
  }
}
