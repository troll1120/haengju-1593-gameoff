import { BPH_WORLD_TO_PX } from "./bph-contract";
import type { BphFxContext } from "./bph-contract";
import { bphFxContext } from "./bph-fx-dispatch";
import { aliveBphTomes } from "./bph-active-tomes";
import type { Enemy, Run } from "./rules";

/** First numbers for the two re-added books (owner DM 1794914054.342769); balance is set at merge.
 *  용염: a 3 s fire patch dealing 1 every 0.5 s, about 6 per foe per patch, near the thunder book's damage but spread over a cluster.
 *  빙설: a cold field slows move and attack 40% for 3 s; a foe caught again while still chilled freezes 0.5 s, a short stop, not a lock. */
export const BPH_DRAGON_FIRE = { radius: 0.4, duration: 3, tick: 0.5, damage: 1 } as const;
export const BPH_BLIZZARD = { radius: 0.6, slow: 0.4, duration: 3, freeze: 0.5 } as const;
/** 격려 (Tome_HeroFrenzy, owner DMs 1794933267.509189, 1794934242.328279): for its authored 15 s our soldiers (not generals)
 *  attack 60% faster and take 20% less damage (about +25% effective HP); they are drawn only 1.1x, a slight swell (1.5x read as
 *  too big). The authored -30% attack rate, -40% move, +100% damage and +80% area are not used: faster swings are the headline,
 *  about +60% damage per second like the first cut. Size is drawing only: reach, contact and area stay as they are.
 *  A second draw while active adds another 15 s. */
export const BPH_HERO_FRENZY = { id: "Tome_HeroFrenzy", attackSpeed: 0.6, reduction: 0.2, scale: 1.1 } as const;
const CHILLED = "Chilled";

const fieldable = (enemy: Enemy): boolean => enemy.hp > 0 && enemy.kind !== "ship" && !enemy.cargo?.length;

/** The live foe with the most live foes within `radius` px (itself included); the earliest in roster order wins a tie. */
export function bphDensestEnemy(enemies: readonly Enemy[], radius: number): Enemy | undefined {
  const alive = enemies.filter(fieldable);
  let best: Enemy | undefined, most = 0;
  for (const enemy of alive) {
    const near = alive.filter(other => Math.hypot(other.x - enemy.x, other.y - enemy.y) <= radius).length;
    if (near > most) { best = enemy; most = near; }
  }
  return best;
}

/** at: the cursor point the patch is laid on; without it the patch lands on the densest cluster. */
export function landBphDragonFire(ctx: BphFxContext, amountPerTick: number, at?: { readonly x: number; readonly y: number }): void {
  const radius = BPH_DRAGON_FIRE.radius * BPH_WORLD_TO_PX, target = at ?? bphDensestEnemy(ctx.run.enemies, radius);
  if (!target) return;
  ctx.state.actors.push({ id: ctx.run.nextId++, ownerId: -1, kind: "mine", x: target.x, y: target.y, toX: target.x, toY: target.y,
    startedAt: ctx.run.time, until: ctx.run.time + BPH_DRAGON_FIRE.duration, power: amountPerTick, radius, targets: [],
    data: { dragonFire: 1, clock: 0 } });
  ctx.emit({ kind: "blast", x: target.x, y: target.y, value: radius });
}

/** at: the cursor point the cold field centres on; without it the field covers the densest cluster. */
export function castBphBlizzard(ctx: BphFxContext, power: number, at?: { readonly x: number; readonly y: number }): void {
  const radius = BPH_BLIZZARD.radius * BPH_WORLD_TO_PX, center = at ?? bphDensestEnemy(ctx.run.enemies, radius);
  if (!center) return;
  for (const enemy of ctx.run.enemies) {
    if (!fieldable(enemy) || Math.hypot(enemy.x - center.x, enemy.y - center.y) > radius) continue;
    const chill = ctx.state.statuses.find(status => status.id === CHILLED && status.targetId === enemy.id && status.until > ctx.run.time);
    if (chill) enemy.stun = Math.max(enemy.stun, BPH_BLIZZARD.freeze * power);
    const until = ctx.run.time + BPH_BLIZZARD.duration * power;
    if (chill) chill.until = Math.max(chill.until, until);
    else ctx.state.statuses.push({ targetId: enemy.id, id: CHILLED, until, power: BPH_BLIZZARD.slow, stacks: 1, side: "enemy" });
  }
}

export function tickBphTomeFields(ctx: BphFxContext, dt: number): void {
  const done = new Set<number>();
  for (const actor of ctx.state.actors) {
    if (actor.data.dragonFire !== 1) continue;
    const remaining = actor.until - (ctx.run.time - dt);
    actor.data.clock += Math.max(0, Math.min(dt, remaining));
    while (actor.data.clock >= BPH_DRAGON_FIRE.tick) {
      actor.data.clock -= BPH_DRAGON_FIRE.tick;
      for (const enemy of ctx.run.enemies) if (fieldable(enemy) && Math.hypot(enemy.x - actor.x, enemy.y - actor.y) <= actor.radius)
        ctx.applyDamage({ target: enemy, amount: actor.power, spellId: "Spell_DragonsCall", position: actor });
      ctx.emit({ kind: "blast", x: actor.x, y: actor.y, value: actor.radius });
    }
    if (ctx.run.time >= actor.until) done.add(actor.id);
  }
  if (done.size) ctx.state.actors = ctx.state.actors.filter(actor => !done.has(actor.id));
  ctx.state.statuses = ctx.state.statuses.filter(status => status.id !== CHILLED || status.until > ctx.run.time);
}

/** Drawing scale of our soldiers: BPH_HERO_FRENZY.scale while 격려 is active, else 1. */
export function bphHeroFrenzyScale(run: Run): number {
  const ctx = bphFxContext(run);
  return ctx && aliveBphTomes(ctx).some(tome => tome.id === BPH_HERO_FRENZY.id) ? BPH_HERO_FRENZY.scale : 1;
}

const chilledMemo = new WeakMap<Run, { time: number; chilled: ReadonlySet<number> }>();
const EMPTY: ReadonlySet<number> = new Set();
export function bphChilledEnemies(run: Run): ReadonlySet<number> {
  const ctx = bphFxContext(run);
  if (!ctx) return EMPTY;
  // Chilled statuses are written and pruned only inside the rules' ticks, so run.time pins the set exactly.
  const memo = chilledMemo.get(run);
  if (memo && memo.time === run.time) return memo.chilled;
  const chilled = new Set(ctx.state.statuses.filter(status => status.id === CHILLED && status.until > run.time).map(status => status.targetId));
  chilledMemo.set(run, { time: run.time, chilled });
  return chilled;
}
