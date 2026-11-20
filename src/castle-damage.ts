import { bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { chaosCastleGuard, chaosDefense } from "./chaos";
import { recordDefensePressure } from "./defense-pressure";
import { strikeFort } from "./fortification";
import { CENTER, SIDES } from "./geometry";
import type { Point } from "./geometry";
import { BALANCE } from "./rules";
import type { Effect, Enemy, Run, Telegraph } from "./rules";

type Attacker = {
  readonly cause: Enemy["kind"];
  readonly boss_kind: "regular" | "midboss" | "boss";
};
export type CastleLethalHit = (Attacker | {
  readonly cause: "unknown";
  readonly boss_kind: "unknown";
}) & {
  readonly attackKind: "wall" | "projectile" | "fire" | "ladder";
};

const lethalHits = new WeakMap<Run, CastleLethalHit>();
const castAttackers = new WeakMap<Telegraph, Attacker>();

function identifyAttacker(enemy: Enemy): Attacker {
  return { cause: enemy.kind, boss_kind: enemy.miniboss ? "midboss" : enemy.boss ? "boss" : "regular" };
}

export function rememberCastleCast(mark: Telegraph, attacker: Enemy): void {
  if (mark.wallDamage > 0 || mark.skill === "fire") castAttackers.set(mark, identifyAttacker(attacker));
}

export function castleLethalHit(run: Run): CastleLethalHit | undefined {
  return lethalHits.get(run);
}

export function recordLethalCastleHit(run: Run, hit: {
  readonly beforeHp: number;
  readonly attacker: Enemy | null;
  readonly attackKind: CastleLethalHit["attackKind"];
  readonly cast?: Telegraph;
}): void {
  if (hit.beforeHp <= 0 || run.base !== 0 || lethalHits.has(run)) return;
  const caster = hit.cast && castAttackers.get(hit.cast);
  const source = caster ?? (hit.attacker && identifyAttacker(hit.attacker));
  lethalHits.set(run, { ...(source ?? { cause: "unknown", boss_kind: "unknown" }), attackKind: hit.attackKind });
}

export function batter(run: Run, effects: Effect[], hit: {
  readonly at: Point;
  readonly amount: number;
  readonly attacker: number;
  readonly reached?: boolean;
  readonly attackKind: CastleLethalHit["attackKind"];
  readonly cast?: Telegraph;
}): void {
  const { at, attacker, reached, attackKind, cast } = hit;
  const defense = chaosDefense(run);
  if (defense) defense.castleIncoming += hit.amount;
  if (run.shieldUntil > run.time) {
    if (defense) defense.castlePrevented += hit.amount;
    recordDefensePressure(run, "castle", hit.amount, hit.amount);
    run.metrics.blocked += hit.amount; effects.push({ kind: "block", x: at.x, y: at.y, value: Math.round(hit.amount) }); return;
  }
  const guard = chaosCastleGuard(run);
  recordDefensePressure(run, "castle", hit.amount, hit.amount * (1 - guard));
  if (defense && guard !== 1) defense.castlePrevented += hit.amount * (1 - guard);
  const amount = guard === 1 ? hit.amount : hit.amount * guard;
  const source = run.enemies.find(enemy => enemy.id === attacker) ?? null;
  const shield = bphFxContext(run)?.state.castleShield;
  let remaining = amount;
  if (shield && shield.hp > 0) {
    const absorbed = Math.min(shield.hp, remaining);
    shield.hp -= absorbed; remaining -= absorbed; run.metrics.blocked += absorbed;
    effects.push({ kind: "block", x: at.x, y: at.y, value: absorbed });
    if (shield.hp === 0) dispatchBphEffects(run, { kind: "shieldBroken", attacker: source,
      position: { x: at.x, y: at.y }, absorbed });
  }
  if (remaining <= 0) return;
  const beforeHp = run.base;
  const boss = run.enemies.find(enemy => enemy.id === attacker && enemy.boss);
  strikeFort(run, at, remaining, run.bph ? 1
    : boss ? BALANCE.bossKeepBlow * (run.time >= 480 ? 4 : 1) : reached ? BALANCE.keepBlow : 1);
  recordLethalCastleHit(run, { beforeHp, attacker: source, attackKind, cast });
  if (run.base < beforeHp) dispatchBphEffects(run, { kind: "towerAttacked", attacker: source,
    position: { x: CENTER.x, y: CENTER.y }, amount: remaining, hpLost: beforeHp - run.base });
  if (run.metrics.firstBreach === null && SIDES.some(side => run.walls[side] <= 0)) run.metrics.firstBreach = run.time;
  if (boss) {
    run.metrics.bossDamage += amount;
    const record = run.metrics.bosses.find(item => item.appeared === boss.appearedAt);
    if (record) record.dealt += amount;
  }
  if (run.base <= 0) run.lossCause = boss ? "boss" : "army";
  effects.push({ kind: "wall", x: reached ? CENTER.x : at.x, y: reached ? CENTER.y : at.y, value: amount, target: attacker });
}
