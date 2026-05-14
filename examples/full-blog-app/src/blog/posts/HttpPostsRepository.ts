import { Logger } from "../../shared/Logger.js";
import type { Post } from "./Post.js";

export class HttpPostsRepository {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly authToken: string,
    private readonly logger: Logger,
  ) {}

  async list(): Promise<Post[]> {
    this.logger.info("listing posts");
    const response = await fetch(`${this.apiBaseUrl}/posts`, {
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    return response.json() as Promise<Post[]>;
  }

  async create(title: string, body: string): Promise<Post> {
    this.logger.info(`creating post: ${title}`);
    const response = await fetch(`${this.apiBaseUrl}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, body }),
    });
    return response.json() as Promise<Post>;
  }
}
