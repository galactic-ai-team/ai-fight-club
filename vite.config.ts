import { defineConfig } from "vitest/config";
import { commanderDevPlugin } from "./src/commander/vitePlugin.ts";

export default defineConfig({
  root: ".",
  publicDir: "public",
  plugins: [commanderDevPlugin() as import("vite").Plugin],
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: "index.html",
        watch: "watch.html",
        relay: "relay.html",
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
