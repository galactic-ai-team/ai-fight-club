import { createRandomBot } from "./randomBot.ts";
import { createRusherBot } from "./rusherBot.ts";
import { createStatueBot } from "./statueBot.ts";
import { createZonerBot } from "./zonerBot.ts";
import { createTurtlerBot } from "./turtlerBot.ts";
import { createUtilityBot } from "./utilityBot.ts";
import { createLumiBot } from "./lumi.ts";
import { createGpt6Bot } from "./gpt6.ts";
import type { Bot } from "./types.ts";

export type { Bot, BotFactory, BotStartContext } from "./types.ts";
export { createRandomBot } from "./randomBot.ts";
export { createRusherBot } from "./rusherBot.ts";
export { createStatueBot } from "./statueBot.ts";
export { createZonerBot } from "./zonerBot.ts";
export { createTurtlerBot } from "./turtlerBot.ts";
export { createUtilityBot } from "./utilityBot.ts";
export { createLumiBot } from "./lumi.ts";
export { createGpt6Bot, ready as gpt6Ready } from "./gpt6.ts";

export const BUILTIN_BOTS = [
  "random",
  "rusher",
  "statue",
  "zoner",
  "turtler",
  "utility",
] as const;

export type BuiltinBotId = (typeof BUILTIN_BOTS)[number];

export function createBot(id: string): Bot {
  switch (id) {
    case "random":
      return createRandomBot();
    case "rusher":
      return createRusherBot();
    case "statue":
      return createStatueBot();
    case "zoner":
      return createZonerBot();
    case "turtler":
      return createTurtlerBot();
    case "utility":
      return createUtilityBot();
    case "lumi":
      return createLumiBot();
    case "gpt6":
      return createGpt6Bot();
    default:
      throw new Error(`unknown bot: ${id}`);
  }
}
