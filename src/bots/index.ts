import { createRandomBot } from "./randomBot.ts";
import { createRusherBot } from "./rusherBot.ts";
import { createStatueBot } from "./statueBot.ts";
import type { Bot } from "./types.ts";

export type { Bot, BotFactory, BotStartContext } from "./types.ts";
export { createRandomBot } from "./randomBot.ts";
export { createRusherBot } from "./rusherBot.ts";
export { createStatueBot } from "./statueBot.ts";

export const BUILTIN_BOTS = ["random", "rusher", "statue"] as const;
export type BuiltinBotId = (typeof BUILTIN_BOTS)[number];

export function createBot(id: string): Bot {
  switch (id) {
    case "random":
      return createRandomBot();
    case "rusher":
      return createRusherBot();
    case "statue":
      return createStatueBot();
    default:
      throw new Error(`unknown bot: ${id}`);
  }
}
