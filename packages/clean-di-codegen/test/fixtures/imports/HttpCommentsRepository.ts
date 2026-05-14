import type { Logger } from "./Logger";

export class HttpCommentsRepository {
  private readonly tag = "comments-repo";
  constructor(public readonly logger: Logger) {
    void this.tag;
  }
  list(): unknown[] {
    return [];
  }
}
