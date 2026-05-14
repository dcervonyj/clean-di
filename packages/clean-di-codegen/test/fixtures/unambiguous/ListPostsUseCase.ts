import { HttpPostsRepository } from "./HttpPostsRepository";

export class ListPostsUseCase {
  private readonly tag = "use-case";
  constructor(public readonly repository: HttpPostsRepository) {
    void this.tag;
  }
  execute(): unknown[] {
    return this.repository.list();
  }
}
