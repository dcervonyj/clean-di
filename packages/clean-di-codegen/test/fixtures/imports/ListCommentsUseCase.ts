import type { HttpCommentsRepository } from "./HttpCommentsRepository";

export class ListCommentsUseCase {
  private readonly tag = "list-comments";
  constructor(public readonly repository: HttpCommentsRepository) {
    void this.tag;
  }
  execute(): unknown[] {
    return this.repository.list();
  }
}
