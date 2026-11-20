import { expect, test } from "bun:test";
import type { BphFxContext } from "./bph-contract";
import { bindBphConsumers, dispatchBphEffects, freshBphFxState } from "./bph-fx-dispatch";
import { BPH_STATUS_CONSUMERS } from "./bph-fx-status";
import { freshBphSave } from "./bph-save";
import { addBphProfile, bphUnitInfo, createBphBattle } from "./bph-combat";
import { bphEffectCombat, createRun } from "./rules";
import type { Effect } from "./rules";
import { CENTER } from "./geometry";
import { BPH_PACKS, BPH_TOMES } from "./bph-data";
import { BPH_WITHHELD_TOMES, bphDrawPool } from "./bph-tome-availability";
import { bphChilledEnemies } from "./bph-tome-fields";

const drawable = [...new Set(Object.values(BPH_PACKS).flatMap(pack => bphDrawPool(pack).map(row => row.id)))]
  .filter(id => BPH_TOMES[id]).sort();

function openTome(id: string) {
  const run = createRun(144), output: Effect[] = [], save = freshBphSave();
  run.bph = createBphBattle(save, [], "WaveChapter1");
  const template = run.enemies[0];
  run.enemies = Array.from({ length: 6 }, (_, index) => ({ ...template, id: run.nextId++, hp: 1000, maxHp: 1000,
    kind: "yari" as const, boss: false, shielded: false, x: CENTER.x + 40 + index * 4, y: CENTER.y + 40 }));
  let spawned = 0, chilled = 0;
  const ctx: BphFxContext = {
    run, save, effects: [], pointer: { x: 0, y: 0 }, state: freshBphFxState(),
    ...bphEffectCombat(run, output), random: () => 0.5,
    profileId: target => target.bph?.profileId ?? null, unitInfo: bphUnitInfo,
    spawnProfile: (profileId, copies, origin) => {
      spawned += copies;
      addBphProfile(run, { profileId, copies, foil: false, discovered: false }, origin ?? { packId: "DeliveryBox", cause: "effect" });
    },
    grantPack: () => { throw new RangeError("Unexpected pack reward"); },
  };
  bindBphConsumers(ctx, BPH_STATUS_CONSUMERS);
  dispatchBphEffects(run, { kind: "pack-opened", result: { id: 1, packId: "Pack_Tomes", ordinal: 1, cards: [
    { profileId: id, foil: false, copies: 1, discovered: true }], frenzy: false, reason: "weighted" } });
  // Pointer tactics act where the player points: aim at the cluster the whole time.
  dispatchBphEffects(run, { kind: "aim", position: { x: CENTER.x + 50, y: CENTER.y + 40 } });
  for (let i = 0; i < 80; i++) {
    run.time += 0.1; dispatchBphEffects(run, { kind: "step", dt: 0.1 });
    chilled = Math.max(chilled, bphChilledEnemies(run).size);
  }
  const unconfirmed = Object.keys(ctx.state.counters).filter(key =>
    key === `status:unconfirmed:tome:${id}` || key.startsWith("status:unconfirmed:spell:"));
  const damaged = run.enemies.some(enemy => enemy.hp < 1000);
  return { unconfirmed, damaged, spawned, chilled };
}

test("the withheld books are not in any drawable pool", () => {
  expect(drawable.filter(id => BPH_WITHHELD_TOMES.has(id))).toEqual([]);
  expect(drawable.length).toBeGreaterThan(0);
});

test.each(drawable)("drawable book %s runs an executed effect, not an unconfirmed placeholder", id => {
  const result = openTome(id);
  expect(result.unconfirmed).toEqual([]);
  // Channelled books (strike, summon, quake, cold field) must also show their effect within 8 s; stat books are covered by their own tests.
  if ([0, 1, 6, 11].includes(BPH_TOMES[id].effectKind)) expect(result.damaged || result.spawned > 0 || result.chilled > 0).toBe(true);
});
