import { unlockBphGeneral } from "./bph-commanders";
import { bphMilestones, ensureBphSave } from "./bph-session";
import { keepMeta } from "./meta";
import type { Meta } from "./meta";
import { showResultUnlocks } from "./result-screen";

/** Backfill existing milestones before rendering account screens. */
export function checkGeneralUnlocks(meta: Meta, returnFocus: HTMLElement): void {
  const unlocked = unlockBphGeneral(ensureBphSave(meta), bphMilestones(meta));
  if (!unlocked.length) return;
  keepMeta(meta);
  showResultUnlocks(unlocked, returnFocus);
}
