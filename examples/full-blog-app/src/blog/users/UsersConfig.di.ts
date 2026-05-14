import { defineConfig, bean } from "clean-di";

import { HttpUsersRepository } from "./HttpUsersRepository.js";
import { GetCurrentUserUseCase } from "./GetCurrentUserUseCase.js";

export const usersConfig = defineConfig({
  beans: {
    usersRepository: bean(HttpUsersRepository),
    getCurrentUser: bean(GetCurrentUserUseCase),
  },
});
