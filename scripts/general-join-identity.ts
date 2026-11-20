import { createHash } from "node:crypto";
import { BPH_GENERALS } from "../src/bph-commanders";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { survivalFixture } from "./survival-fixtures";
import type { SurvivalState } from "./survival-fixtures";
import { simulateSurvival } from "./survival-sim";

/** Historical combat pins for runs without a mid-battle general. */
export const JOIN_IDENTITY_CASES = [
  { name: "one-general-C1-full144-410s", seed: 3, chapter: 1, state: "full144", capSeconds: 410, unlocked: 1 },
  { name: "eight-generals-C4-none-lost", seed: 1, chapter: 4, state: "none", capSeconds: undefined, unlocked: 8 },
  { name: "eight-generals-C1-typical-165s", seed: 3, chapter: 1, state: "typical", capSeconds: 165, unlocked: 8 },
] as const;

export async function joinIdentityHashes(): Promise<Record<string, { hash: string; survival: number; phase: string }>> {
  const out: Record<string, { hash: string; survival: number; phase: string }> = {};
  for (const item of JOIN_IDENTITY_CASES) {
    const meta = freshMeta(), save = freshBphSave(item.seed);
    save.chapter = item.chapter - 1;
    save.purchasedPlacements = [...(await survivalFixture(item.state as SurvivalState)).purchasedPlacements];
    save.unlockedGenerals = BPH_GENERALS.slice(0, item.unlocked);
    const row = await simulateSurvival({ seed: item.seed, chapter: item.chapter, general: "권율", state: item.state,
      policy: "cursor0", account: { meta, save }, ...(item.capSeconds === undefined ? {} : { capSeconds: item.capSeconds }) });
    out[item.name] = { hash: createHash("sha256").update(JSON.stringify(row)).digest("hex"), survival: row.survival, phase: row.phase };
  }
  return out;
}

if (import.meta.main) console.log(JSON.stringify(await joinIdentityHashes(), null, 2));
