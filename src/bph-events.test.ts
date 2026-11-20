import { expect, test } from "bun:test";
import { bindBphConsumers, bphFxContext } from "./bph-fx-dispatch";
import { freshMeta } from "./meta";
import { createBphRun } from "./bph-session";
import { addBphProfile, bphArms } from "./bph-combat";
import { advance, createRun, useSkill } from "./rules";
import type { BphEffectConsumer, BphFxEvent } from "./bph-contract";
import { enterBphImprovements, grantBphPacks, notifyBphQuestCompletion, startBphCampaignAttempt } from "./bph-account";
import { bphSurvivalPlan } from "./bph-survival";

function battle(events: BphFxEvent[], onEvent?: BphEffectConsumer["onEvent"]) {
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [] });
  const ctx = bphFxContext(run);
  if (!ctx) throw new Error("Production run did not bind its consumers");
  bindBphConsumers(ctx, [{ id: "profiles", kinds: [],
    onEvent: (ctx, event) => { events.push(event); onEvent?.(ctx, event); },
    consume: () => { throw new Error("No kinds in this event observer"); } }], false);
  return ctx;
}
test("profile spawn dispatches fresh stats and preserves real pack/result/parent/foil provenance", () => {
  const events: BphFxEvent[] = [];
  const ctx = battle(events, (_ctx, event) => { if (event.kind === "unit-stats") event.stats.damage *= 2; });
  ctx.spawnProfile("Hero1_Squire", 1, { packId: "Pack1_Basic", resultId: 41, parentId: 0, cause: "summon", foil: true });
  const unit = ctx.run.squads[0].soldiers[0];
  expect(ctx.unitInfo(unit)).toMatchObject({ profileId: "Hero1_Squire", packId: "Pack1_Basic",
    resultId: 41, parentId: 0, cause: "summon", foil: true, lifeId: 1, originalClass: 1 });
  expect(events.filter(e => e.kind === "unit-spawn")).toHaveLength(1);
  expect(bphArms(unit, ctx.run)?.power).toBe(2);
  expect(bphArms(unit, ctx.run)?.power).toBe(2);
});
test("damage from a registered consumer still emits the actual kill and bounded final damage", () => {
  const events: BphFxEvent[] = [], ctx = battle(events);
  const enemy = createRun(11).enemies[0]; enemy.hp = 1; enemy.kind = "yari"; enemy.shielded = false;
  ctx.run.enemies = [enemy];
  ctx.applyDamage({ target: enemy, amount: 8, critical: true, spellId: "Spell_Thunderbolt" });
  expect(events.filter(e => e.kind === "enemy-killed")).toHaveLength(1);
  expect(events.find(e => e.kind === "damage-dealt")).toMatchObject({ attempted: 8, dealt: 1, overkill: 7, blocked: 0, spellId: "Spell_Thunderbolt" });
  expect(events.find(e => e.kind === "unitKilled")).toMatchObject({ side: "enemy", critical: true, origin: "effect" });
});
test("all consumers can query transitive original class aliases without changing the Korean class", () => {
  const events: BphFxEvent[] = [], ctx = battle(events);
  ctx.spawnProfile("Hero1_Squire", 1);
  const unit = ctx.run.squads[0].soldiers[0];
  const aliases = [[1, 3], [3, 5], [5, 1]].map(([a, b]) => ({
    nodeId: `${a}:${b}`, type: "HeroClassAlsoCountsAs", value: 1, effectPower: 0,
    effectPowerScale: 0, stackCap: 0, countStep: 0, targets: { targetClass: String(a), secondTargetClass: String(b) },
  }));
  bindBphConsumers({ ...ctx, effects: aliases }, [], false);
  expect([...ctx.originalClasses(unit)].sort()).toEqual([1, 3, 5]);
  expect(unit.kind).toBe("spearman");
});
test("actor-owned hook, wheel and mine transitions retain their owner in dispatch", () => {
  const events: BphFxEvent[] = [], ctx = battle(events), target = createRun(11).enemies[0];
  const actor = { id: 1, ownerId: ctx.run.squads[0].id, kind: "hook" as const, x: 1, y: 2,
    toX: 3, toY: 4, startedAt: 0, until: 1, power: 1, radius: 1, targets: [], data: {} };
  ctx.state.actors.push(actor);
  ctx.emitEvent({ kind: "hook-pull", actor, phase: "hit", target });
  ctx.emitEvent({ kind: "wheel-edge", actor: { ...actor, kind: "wheel" }, side: "좌" });
  ctx.emitEvent({ kind: "mine-chain", actor: { ...actor, kind: "mine" }, previous: null });
  expect(events.map(e => e.kind)).toEqual(["hook-pull", "wheel-edge", "mine-chain"]);
  expect(ctx.state.actors[0].ownerId).toBe(ctx.run.squads[0].id);
});
test("buff application owns the timed status and emits the original power and source", () => {
  const events: BphFxEvent[] = [], ctx = battle(events), unit = ctx.run.squads[0];
  ctx.applyBuff({ target: unit, side: "ally", id: "Charge", duration: 10, power: 100, stacks: 1, source: unit });
  expect(ctx.state.statuses).toEqual([{ targetId: unit.id, id: "Charge", until: 10, power: 100, stacks: 1, side: "ally", sourceId: unit.id }]);
  expect(events.filter(e => e.kind === "buff-applied")).toHaveLength(1);
});
test("consume claims one dead target and completes only for its owning unit", () => {
  const events: BphFxEvent[] = [], ctx = battle(events), unit = ctx.run.squads[0];
  const enemy = createRun(11).enemies[0]; enemy.hp = 0;
  expect(ctx.beginConsume(unit, enemy)).toBe(true);
  expect(ctx.beginConsume(unit, enemy)).toBe(false);
  expect(ctx.endConsume(unit, enemy)).toBe(true);
  expect(ctx.endConsume(unit, enemy)).toBe(false);
  expect(ctx.state.consumptions).toEqual([{ sourceId: unit.id, targetId: enemy.id, phase: "end" }]);
  expect(events.filter(e => e.kind === "consume").map(e => e.phase)).toEqual(["start", "end"]);
});
test("a real completed native charge segment emits dash-end", () => {
  const events: BphFxEvent[] = [], ctx = battle(events);
  const squad = ctx.run.squads[0]; squad.general = "김여물"; squad.skillClock = 0;
  useSkill(ctx.run, 0);
  for (let i = 0; i < 45; i++) advance(ctx.run, 1 / 30);
  expect(events.filter(e => e.kind === "dash-end")).toHaveLength(1);
  expect(squad.lane).toBe(null);
});
test("actual wave pack grants preserve the wave source and emit one event per instance", () => {
  const events: BphFxEvent[] = [], ctx = battle(events);
  grantBphPacks(ctx.save, { packId: "Pack1_Basic", count: 2, metadata: { sourceWave: "WaveChapter1" } });
  expect(ctx.save.inventory.map(p => p.sourceWave)).toEqual(["WaveChapter1", "WaveChapter1"]);
  expect(events.filter(e => e.kind === "wave-pack-spawn")).toHaveLength(2);
});
test.each(["improvements-start", "campaign-start", "quest-completed"] as const)("%s uses its actual persistent receipt", kind => {
  const events: BphFxEvent[] = [], ctx = battle(events);
  const invoke = () => {
    switch (kind) {
      case "improvements-start": return enterBphImprovements(ctx.save);
      case "campaign-start": return startBphCampaignAttempt(ctx.save);
      case "quest-completed":
        ctx.save.questProgress["claims:node:0:0"] = 1;
        return notifyBphQuestCompletion(ctx.save, "node:0:0");
    }
  };
  expect(invoke()).toBe(true); expect(invoke()).toBe(false);
  expect(events.filter(e => e.kind === kind)).toHaveLength(1);
});
test("survival keeps spawning beyond the original chapter window", () => {
  const events: BphFxEvent[] = [], ctx = battle(events);
  ctx.run.time = 35.99;
  advance(ctx.run, .05); advance(ctx.run, .05);
  expect(events.filter(e => e.kind === "wave-spawn-complete")).toHaveLength(0);
});
test("the survival deadline emits wave-spawn-complete once", () => {
  const events: BphFxEvent[] = [], ctx = battle(events), combat = ctx.run.bph;
  if (!combat?.survival) throw new TypeError("Missing survival battle");
  ctx.run.time = 899.99;
  combat.survival.cursor = bphSurvivalPlan(combat.waveId).length;
  advance(ctx.run, .05); advance(ctx.run, .05);
  expect(events.filter(e => e.kind === "wave-spawn-complete")).toHaveLength(1);
});
test("the lightning spellbook emits cast and hit from its actual timed execution", () => {
  const events: BphFxEvent[] = [], ctx = battle(events);
  ctx.run.enemies = createRun(11).enemies.slice(0, 2);
  for (const enemy of ctx.run.enemies) { enemy.hp = 100; enemy.kind = "yari"; enemy.stun = 100; }
  addBphProfile(ctx.run, { profileId: "Tome_Thunderstorm", copies: 1, foil: false, discovered: true }, { packId: "Pack1_Basic" });
  for (let i = 0; i < 7; i++) advance(ctx.run, .1);
  expect(events.filter(e => e.kind === "spellCast")).toHaveLength(2);
  expect(events.filter(e => e.kind === "spellHit")).toHaveLength(2);
});
test.each(["bounce", "pierce"] as const)("%s follows its own path through actual projectile hits", mode => {
  const run = createBphRun(freshMeta(), { seed: 11, general: "권율", upgrades: [] });
  const base = createRun(11).enemies[0];
  run.squads = [];
  run.enemies = [
    { ...base, id: 1001, x: 100, y: 100, hp: 100, stun: 100 },
    { ...base, id: 1002, x: 100, y: 120, hp: 100, stun: 100 },
    { ...base, id: 1003, x: 130, y: 100, hp: 100, stun: 100 },
  ];
  run.shots = [{ id: 2000, kind: "arrow", x: 90, y: 100, toX: 100, toY: 100, speed: 340,
    target: 1001, prey: null, damage: 10, critical: false, by: "weapon", splash: 0,
    pierce: mode === "pierce" ? 1 : 0, bounces: mode === "bounce" ? 1 : 0, bounceRange: 100, hitIds: [], from: 0 }];
  advance(run, .1); advance(run, .1);
  expect(run.enemies.find(e => e.id === 1002)?.hp).toBe(mode === "bounce" ? 90 : 100);
  expect(run.enemies.find(e => e.id === 1003)?.hp).toBe(mode === "pierce" ? 90 : 100);
});
