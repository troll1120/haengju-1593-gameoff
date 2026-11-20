import { expect, test } from "bun:test";
import type { BphFxContext } from "./bph-contract";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { bindBphConsumers, dispatchBphEffects, freshBphFxState } from "./bph-fx-dispatch";
import { BPH_STATUS_CONSUMERS } from "./bph-fx-status";
import { freshBphSave } from "./bph-save";
import { bphUnitInfo, createBphBattle } from "./bph-combat";
import { bphEffectCombat, createRun } from "./rules";
import type { Effect } from "./rules";
import { BPH_BLIZZARD, BPH_DRAGON_FIRE, bphChilledEnemies, castBphBlizzard } from "./bph-tome-fields";

function field(spots: readonly (readonly [number, number])[]) {
  const run = createRun(144), output: Effect[] = [], save = freshBphSave();
  run.bph = createBphBattle(save, [], "WaveChapter1");
  const template = run.enemies[0];
  run.enemies = spots.map(([x, y]) => ({ ...template, id: run.nextId++, hp: 100, maxHp: 100, stun: 0,
    kind: "yari" as const, boss: false, shielded: false, x, y }));
  const ctx: BphFxContext = {
    run, save, effects: [], pointer: { x: 0, y: 0 }, state: freshBphFxState(),
    ...bphEffectCombat(run, output), random: () => 0.5,
    profileId: target => target.bph?.profileId ?? null, unitInfo: bphUnitInfo,
    spawnProfile: () => { throw new RangeError("Unexpected summon"); },
    grantPack: () => { throw new RangeError("Unexpected pack reward"); },
  };
  bindBphConsumers(ctx, BPH_STATUS_CONSUMERS);
  const step = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / 0.05); i++) { run.time += 0.05; dispatchBphEffects(run, { kind: "step", dt: 0.05 }); }
  };
  const open = (id: string) => dispatchBphEffects(run, { kind: "pack-opened", result: { id: 1, packId: "Pack_Tomes", ordinal: 1,
    cards: [{ profileId: id, foil: false, copies: 1, discovered: true }], frenzy: false, reason: "weighted" } });
  return { ctx, run, output, step, open };
}

const LONE_THEN_CLUSTER = [[60, 200], [300, 500], [306, 504], [296, 498]] as const;

test("용염 waits for the pointer, then lays fire patches along the drag path that burn their whole duration", () => {
  const s = field(LONE_THEN_CLUSTER), aim = (x: number, y: number) => dispatchBphEffects(s.run, { kind: "aim", position: { x, y } });
  s.open("Tome_DragonsCall");
  s.step(1);
  expect(s.ctx.state.actors.some(actor => actor.data.dragonFire === 1)).toBe(false);
  aim(300, 500);
  s.step(0.25);
  const radius = BPH_DRAGON_FIRE.radius * BPH_WORLD_TO_PX;
  aim(300 + radius + 1, 500);
  s.step(0.25);
  dispatchBphEffects(s.run, { kind: "aim", position: null });
  const patches = s.ctx.state.actors.filter(actor => actor.data.dragonFire === 1);
  expect(patches.map(actor => [actor.x, actor.y])).toEqual([[300, 500], [300 + radius + 1, 500]]);
  s.step(BPH_DRAGON_FIRE.duration + 0.1);
  const [lone, ...cluster] = s.run.enemies;
  expect(lone.hp).toBe(100);
  for (const enemy of cluster) expect(100 - enemy.hp).toBeGreaterThanOrEqual(BPH_DRAGON_FIRE.damage * BPH_DRAGON_FIRE.duration / BPH_DRAGON_FIRE.tick);
  expect(s.ctx.state.actors.some(actor => actor.data.dragonFire === 1)).toBe(false);
  expect(s.output.filter(effect => effect.kind === "blast").length).toBeGreaterThan(0);
});

test("용염 is deterministic: two identical fights with the same pointer events end with identical health", () => {
  const health = () => {
    const s = field(LONE_THEN_CLUSTER); s.open("Tome_DragonsCall");
    for (const [x, y] of [[290, 490], [310, 505], [330, 520]]) { dispatchBphEffects(s.run, { kind: "aim", position: { x, y } }); s.step(1); }
    s.step(4); return s.run.enemies.map(enemy => enemy.hp);
  };
  const first = health();
  expect(first).toEqual(health());
  expect(first.slice(1).every(hp => hp < 100)).toBe(true);
});

test("빙설 chills the cluster, freezes a foe caught again while chilled, and the chill wears off", () => {
  const s = field(LONE_THEN_CLUSTER);
  castBphBlizzard(s.ctx, 1);
  const [lone, ...cluster] = s.run.enemies;
  expect([...bphChilledEnemies(s.run)].sort()).toEqual(cluster.map(enemy => enemy.id).sort());
  expect(cluster.every(enemy => enemy.stun === 0)).toBe(true);
  castBphBlizzard(s.ctx, 1);
  expect(cluster.every(enemy => enemy.stun === BPH_BLIZZARD.freeze)).toBe(true);
  expect(lone.stun).toBe(0);
  s.step(BPH_BLIZZARD.duration + 0.1);
  expect(bphChilledEnemies(s.run).size).toBe(0);
});
