import { expect, test } from "bun:test";
import { BPH_CODEX_GROUPS, bphCodexCompletion } from "./bph-codex-groups";
import { BPH_CODEX_SLOTS } from "./bph-codex-data";
import { bphSlotArt } from "./bph-codex-page";
import { bphCodexEntries } from "./bph-codex";
import { bphCodexUnread } from "./bph-view";
import { discoverBphCodex, reconcileBphCodexRewards } from "./bph-codex-rewards";
import { freshBphSave, parseBphSave } from "./bph-save";
import { BPH_TOMES } from "./bph-data";
import { BPH_WITHHELD_TOMES } from "./bph-tome-availability";

// Only collectible books have a codex card; a withheld book outside the codex (Tome_FortuneCache) removes none.
const WITHHELD_CARDS = [...BPH_WITHHELD_TOMES].filter(id => BPH_TOMES[id]?.collectible).length;
const LISTED = 54 - WITHHELD_CARDS;

test("grouped cards retain every original identity exactly once and share name and art", () => {
  const entries = bphCodexEntries(freshBphSave());
  expect(entries.flatMap(entry => entry.variants.map(slot => slot.id)).sort())
    .toEqual(BPH_CODEX_SLOTS.map(slot => slot.id).filter(id => !BPH_WITHHELD_TOMES.has(id)).sort());
  expect(entries.filter(entry => entry.variants.length > 1).map(entry => [entry.name, entry.variants.length]))
    .toEqual([["창병", 5], ["기병", 4], ["호위병", 4], ["무사", 3], ["조총병", 2]]);
  for (const entry of entries) {
    for (const slot of entry.variants) expect(bphSlotArt(slot)).toEqual(bphSlotArt(entry.slot));
  }
});

test("several discovered variants count as one discovery and one unread card", () => {
  const save = freshBphSave();
  save.discovered = ["Monster1_Caveling", "Monster1_Raider", "Monster8_Acolyte", "general:권율"];
  expect(bphCodexCompletion(save)).toEqual({ found: 1, total: LISTED, percent: 100 / LISTED });
  expect(bphCodexUnread(save)).toBe(1);
  save.seen = ["Monster1_Caveling", "Monster1_Raider"];
  expect(bphCodexUnread(save)).toBe(1);
  save.seen.push("Monster8_Acolyte");
  expect(bphCodexUnread(save)).toBe(0);
});

test("a second variant earns only its own original receipt once without repaying the group", () => {
  const save = freshBphSave();
  discoverBphCodex(save, "Monster1_Caveling");
  if (!save.codexRewards) throw new Error("missing reward state");
  save.codexRewards.pendingGold = 0; // first receipt already delivered
  discoverBphCodex(save, "Monster1_Raider");
  expect(save.codexRewards.pendingGold).toBe(1);
  expect(save.codexRewards.claimed).toEqual(["discovery:Monster1_Caveling", "discovery:Monster1_Raider"]);
  discoverBphCodex(save, "Monster1_Raider");
  reconcileBphCodexRewards(save);
  bphCodexEntries(save);
  expect(save.codexRewards.pendingGold).toBe(1);
  expect(bphCodexCompletion(save).found).toBe(1);
});

test.each([
  [25, "title:collector"], [50, "frame:bronze"], [100, "frame:gold"],
] as const)("collection at %i percent no longer awards a display-only cosmetic", (percent, reward) => {
  const needed = Math.ceil(LISTED * percent / 100), save = freshBphSave();
  save.discovered = BPH_CODEX_GROUPS.slice(0, needed - 1).map(group => group.slot.id);
  reconcileBphCodexRewards(save);
  expect(save.codexRewards?.claimed).not.toContain(reward);
  const last = BPH_CODEX_GROUPS[needed - 1];
  discoverBphCodex(save, last.variants[last.variants.length - 1].id);
  expect(save.codexRewards?.claimed).not.toContain(reward);
  reconcileBphCodexRewards(save);
  expect(save.codexRewards?.claimed).not.toContain(reward);
});

test("old save retains variant receipts, pending gold, coins and earned cosmetics after grouping", () => {
  const old = freshBphSave();
  old.discovered = ["Monster1_Caveling", "Monster1_Raider", "Monster8_Acolyte"];
  old.seen = ["Monster1_Raider"];
  old.coins = 19;
  old.codexRewards = { version: 1, pendingGold: 2, claimed: [
    "discovery:Monster1_Caveling", "discovery:Monster1_Raider", "discovery:Monster8_Acolyte",
    "title:collector", "frame:bronze",
  ] };
  const loaded = parseBphSave(JSON.parse(JSON.stringify(old)));
  expect(loaded.codexRewards).toEqual(old.codexRewards);
  expect(loaded.coins).toBe(19);
  expect(loaded.discovered).toEqual(old.discovered);
  expect(loaded.seen).toEqual(old.seen);
  expect(parseBphSave(JSON.parse(JSON.stringify(loaded))).codexRewards).toEqual(old.codexRewards);
});

test("legacy save without a reward ledger backfills each variant once", () => {
  const old = freshBphSave();
  old.discovered = ["Monster1_Caveling", "Monster1_Raider"];
  const loaded = parseBphSave(JSON.parse(JSON.stringify(old)));
  expect(loaded.codexRewards).toEqual({ version: 1, pendingGold: 2, claimed: [
    "discovery:Monster1_Caveling", "discovery:Monster1_Raider",
  ] });
  expect(parseBphSave(JSON.parse(JSON.stringify(loaded))).codexRewards).toEqual(loaded.codexRewards);
});
