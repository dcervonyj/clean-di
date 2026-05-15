import type { Logger } from "../../shared/Logger.js";

import type { Comment } from "./Comment.js";

export class HttpCommentsRepository {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly authToken: string,
    private readonly logger: Logger,
  ) {}

  async list(postId: number): Promise<Comment[]> {
    this.logger.info(`listing comments for post ${postId}`);
    const response = await fetch(`${this.apiBaseUrl}/posts/${postId}/comments`, {
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    return response.json() as Promise<Comment[]>;
  }

  async delete(id: number): Promise<void> {
    this.logger.info(`deleting comment ${id}`);
    await fetch(`${this.apiBaseUrl}/comments/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
  }
}
