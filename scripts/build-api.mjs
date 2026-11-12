import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "api", "match.js");
mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: [join(root, "src", "commander", "apiEntry.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  legalComments: "none",
});
console.log("wrote api/match.js");
