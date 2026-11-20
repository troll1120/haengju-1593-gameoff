import type { BphSave } from "./bph-contract";
import { BPH_CODEX_SLOTS } from "./bph-codex-data";
import { BPH_CODEX_CLASS_REWARDS, BPH_CODEX_COSMETICS } from "./bph-codex-rewards";
import { BPH_GENERALS } from "./bph-commanders";
import { language } from "./i18n";

/** Preview builds only. The text stays out of the shared table so a production bundle carries no trace of it. */
export const bphCodexPreviewNotice = (): string => language() === "ko" ? "미리보기: 전부 발견" : "Preview: all found";

/**
 * A detached copy of the account with every codex entry found, read and rewarded and every commander unlocked.
 * The codex draws this copy; the real save is neither changed nor stored.
 */
export function bphCodexPreviewSave(save: BphSave): BphSave {
  const copy = structuredClone(save), ids = BPH_CODEX_SLOTS.map(slot => slot.id);
  copy.discovered = [...new Set([...copy.discovered, ...ids])];
  copy.seen = [...new Set([...copy.seen, ...ids])];
  copy.unlockedGenerals = [...BPH_GENERALS];
  copy.codexRewards = { version: 1, pendingGold: 0, claimed: [
    ...ids.map(id => `discovery:${id}`), ...Object.keys(BPH_CODEX_CLASS_REWARDS).map(classId => `class:${classId}`),
    ...BPH_CODEX_COSMETICS.map(cosmetic => cosmetic.id)] };
  return copy;
}
