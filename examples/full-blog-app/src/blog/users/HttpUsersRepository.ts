import type { Logger } from "../../shared/Logger.js";

import type { User } from "./User.js";

export class HttpUsersRepository {
  constructor(
    private readonly apiBaseUrl: string,
    private readonly authToken: string,
    private readonly logger: Logger,
  ) {}

  async getCurrent(): Promise<User> {
    this.logger.info("fetching current user");
    const response = await fetch(`${this.apiBaseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    return response.json() as Promise<User>;
  }
}
