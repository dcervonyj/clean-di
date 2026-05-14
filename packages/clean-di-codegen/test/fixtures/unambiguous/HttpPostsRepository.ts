import { Logger } from "./Logger";

export class HttpPostsRepository {
  private readonly tag = "repo";
  constructor(public readonly apiBaseUrl: string, public readonly logger: Logger) {
    void this.tag;
  }
  list(): unknown[] {
    return [];
  }
}
