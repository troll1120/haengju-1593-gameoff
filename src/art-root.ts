/**
 * Where the original art drop lives. This repository is checked out as the app directory itself, so the
 * older `<repo>/../..` guess lands outside every checkout and the art tests fail on ENOENT instead of
 * comparing anything. Resolve the drop the way the gate scripts do: an explicit HAENGJU_ART_ROOT first,
 * then the known host locations.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const candidates = [
  process.env.HAENGJU_ART_ROOT,
  "/Volumes/ssd/worktrees/haengju-stage4-fable-1113",
  `${process.env.HOME}/work/haengju-stage4-fable`,
  resolve(import.meta.dir, "../.."),
].filter((path): path is string => Boolean(path));

const found = candidates.find(path => existsSync(resolve(path, "app/public/art")));
if (!found) throw new Error(`original art drop not found: set HAENGJU_ART_ROOT (tried ${candidates.join(", ")})`);

export const ART_PROJECT = found;
export const ART_ORIGINAL = resolve(found, "app/public/art");
