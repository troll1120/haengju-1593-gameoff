import { existsSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * Per-frame folders (art/soldiers/<actor>/, art/generals/<actor>/) whose frames scripts/pack-fullsets.py already packed,
 * losslessly, into the sibling <actor>.webp sheet (and <actor>_bow_attack.webp) that the battle and the codex draw from.
 * The folders stay in public/ as the hashed source of those sheets; builds ship only the sheets (itch accepts at most 1,000 files).
 */
export function packedFrameFolders(root: string): string[] {
  return ["soldiers", "generals"].flatMap(top => readdirSync(resolve(root, top), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(resolve(root, top, `${entry.name}.webp`)))
    .map(entry => `${top}/${entry.name}`)).sort();
}

/** The title preload takes its list from the art atlas (scripts/art-atlas.ts), so this only removes the folders from the build output. */
export function artManifest(): Plugin {
  const root = resolve(process.cwd(), "public/art");
  let outDir = "";
  return {
    name: "art-manifest",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!outDir) return;
      for (const folder of packedFrameFolders(root)) rmSync(resolve(outDir, "art", folder), { recursive: true, force: true });
    },
  };
}
