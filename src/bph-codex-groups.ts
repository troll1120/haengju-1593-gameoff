import type { BphSave } from "./bph-contract";
import { BPH_ENEMY_MAP } from "./bph-data";
import { BPH_CODEX_SLOTS, BPH_CODEX_TEXT } from "./bph-codex-data";
import { BPH_WITHHELD_TOMES } from "./bph-tome-availability";
import type { CodexTextId } from "./bph-codex-data";
import { bphEnemyMapping } from "./bph-waves";

export const BPH_BOSS_TEXT: Readonly<Record<string, CodexTextId>> = {
  ukita: "japan_ukita", konishi: "japan_konishi", wakizaka: "japan_wakizaka",
  kobayakawa: "japan_kobayakawa", kato_yoshiaki: "japan_kato_yoshiaki",
  kurushima: "japan_kurushima", nabeshima: "japan_nabeshima", todo: "japan_todo",
};

export const BPH_CODEX_ENEMY_NAMES: Readonly<Record<string, string>> = {
  yari: "창병", teppo: "조총병", samurai: "무사", cavalry: "기병", guard: "호위병", ship: "왜선",
};
/** Quest and codex labels share the appearance identity, including second forms. */
export function bphEnemyDisplayName(id: string): string | undefined {
  const enemy = bphEnemyMapping(id);
  if (!enemy) return undefined;
  const textId = enemy.bossId && BPH_BOSS_TEXT[enemy.bossId];
  return textId ? BPH_CODEX_TEXT[textId].name : BPH_CODEX_ENEMY_NAMES[enemy.kind];
}
export function bphCodexEnemyTexture(kind: string): string {
  return kind === "guard" ? "so_yoshitoshi" : kind;
}
type Slot = typeof BPH_CODEX_SLOTS[number];
export type BphCodexGroup = {
  readonly slot: Slot;
  readonly variants: readonly Slot[];
};

/** Presentation identity only. Original slots remain the reward/save identities. */
export const BPH_CODEX_GROUPS: readonly BphCodexGroup[] = (() => {
  const groups = new Map<string, { slot: Slot; variants: Slot[] }>();
  for (const slot of BPH_CODEX_SLOTS) {
    if (slot.kind === "tome" && BPH_WITHHELD_TOMES.has(slot.id)) continue;
    const enemy = slot.kind === "enemy" ? BPH_ENEMY_MAP[slot.id] : undefined;
    const key = enemy && !enemy.bossId
      ? JSON.stringify([slot.kind, BPH_CODEX_ENEMY_NAMES[enemy.kind], bphCodexEnemyTexture(enemy.kind), enemy.kind])
      : slot.id;
    const group = groups.get(key);
    if (group) group.variants.push(slot);
    else groups.set(key, { slot, variants: [slot] });
  }
  return [...groups.values()];
})();

export function bphCodexCompletion(save: BphSave) {
  const total = BPH_CODEX_GROUPS.length;
  const found = BPH_CODEX_GROUPS.filter(group =>
    group.variants.some(slot => save.discovered.includes(slot.id))).length;
  return { found, total, percent: found * 100 / total };
}
