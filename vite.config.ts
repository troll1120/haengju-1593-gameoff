import { defineConfig } from "vite";
import { runtimeData } from "./scripts/runtime-data";
import { artAtlas } from "./scripts/art-atlas";
import { artManifest } from "./scripts/art-manifest";
export default defineConfig({
  plugins: [runtimeData(), artAtlas(), artManifest()],
  base: "./",
  // CASTLE_CODEX_PREVIEW=1 builds in the read-only `?codex=all` codex for previews; every other build drops it.
  // The `?sandbox=1` test bench ships in the same preview builds (or with CASTLE_SANDBOX_PREVIEW=1), never in product builds.
  define: { "import.meta.env.STORY_MODE_ENABLED": JSON.stringify(process.env.STORY_MODE_ENABLED === "true"),
    "import.meta.env.CASTLE_CODEX_PREVIEW": JSON.stringify(process.env.CASTLE_CODEX_PREVIEW === "1"),
    "import.meta.env.CASTLE_SANDBOX_PREVIEW": JSON.stringify(process.env.CASTLE_CODEX_PREVIEW === "1" || process.env.CASTLE_SANDBOX_PREVIEW === "1") },
  server: { host: "127.0.0.1", port: 19497, strictPort: true },
  build: { target: "es2022", sourcemap: false, rollupOptions: { output: { manualChunks: { phaser: ["phaser"] } } } },
});
