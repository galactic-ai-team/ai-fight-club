import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runLadder } from "../src/ladder/index.ts";
import { BUILTIN_BOTS } from "../src/bots/index.ts";

const seeds = Array.from({ length: 10 }, (_, i) => i + 1);
const botIds = BUILTIN_BOTS.filter((id) => id !== "statue");
const replayDir = "replays";

mkdirSync(replayDir, { recursive: true });

const result = runLadder({
  botIds: [...botIds],
  seeds,
  onMatch: (match, replay) => {
    const name = `${match.p1}_vs_${match.p2}_seed${match.seed}.json`;
    writeFileSync(join(replayDir, name), JSON.stringify(replay, null, 2));
  },
});

console.table(result.ratings);
