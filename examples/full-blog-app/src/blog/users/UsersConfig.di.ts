import { defineConfig, bean } from "clean-di";

import { GetCurrentUserUseCase } from "./GetCurrentUserUseCase.js";
import { HttpUsersRepository } from "./HttpUsersRepository.js";

export const usersConfig = defineConfig({
  beans: {
    usersRepository: bean(HttpUsersRepository),
    getCurrentUser: bean(GetCurrentUserUseCase),
  },
});
