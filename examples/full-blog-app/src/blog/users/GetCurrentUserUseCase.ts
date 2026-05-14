import { HttpUsersRepository } from "./HttpUsersRepository.js";
import type { User } from "./User.js";

export class GetCurrentUserUseCase {
  constructor(private readonly repo: HttpUsersRepository) {}

  async execute(): Promise<User> {
    return this.repo.getCurrent();
  }
}
