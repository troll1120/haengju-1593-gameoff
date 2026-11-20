import { BPH_PROFILES } from "./bph-data";
import { BPH_GENERAL_CLASS, BPH_GENERALS } from "./bph-commanders";
import { distance } from "./geometry";
import type { Enemy, Run, Shot, Squad, Unit } from "./rules";
import { chaosActive } from "./chaos-state";
import { bphSpellDamage } from "./bph-fx-status";
import { bphFxContext } from "./bph-fx-dispatch";
import { BPH_PROFILE_ATTACK_SPELLS } from "./bph-fx-profiles";
import { generalReach } from "./general-reach";

/** A handled profile attack owns a native spell/actor rather than a normal Shot. */
export function chaosHandledPower(run: Run, unit: Unit, before: { readonly spells: number; readonly actors: number }): number | null {
  const context = bphFxContext(run);
  if (!run.chaos || !context) return null;
  const spellId = BPH_PROFILE_ATTACK_SPELLS[context.profileId(unit) ?? ""];
  const spell = context.state.spells.slice(before.spells).find(spell => spell.sourceId === unit.id && spell.id === spellId);
  if (spell) {
    const amount = bphSpellDamage(context, spell);
    if (amount <= 0) return null;
    spell.attackId = run.chaos.attacks + 1;
    return amount;
  }
  const actor = context.state.actors.slice(before.actors).find(actor => actor.ownerId === unit.id);
  if (!actor || actor.power <= 0) return null;
  actor.attackId = run.chaos.attacks + 1;
  return actor.power;
}

/** Existing pierces keep full damage; only the appended paths use 35% of D. How many hops and how far each reaches grow every
 *  level (GENERAL_REACH, owner DM 1794966115). */
export function chaosArrow(run: Run, shot: Shot): void {
  const state = run.chaos;
  if (!state || !chaosActive(run) || state.mods.general !== "송상현") return;
  const hop = generalReach("송상현", state.level);
  if (!hop) return;
  const count = Math.min(hop.targets, Math.max(0, (state.level >= 20 ? 6 : 3) - shot.pierce));
  if (!count) return;
  shot.chaosPierce = count;
  shot.chaosPierceDamage = shot.damage * state.mods.pierceRatio;
  shot.chaosPierceRange = hop.length;
  shot.retargetRange = hop.length * 2;
  shot.nativeDamage = shot.damage;
  shot.sourceAttackId = state.attacks + 1;
}

export function chaosVolley(run: Run, attack: {
  readonly squad: Squad; readonly unit: Unit; readonly index: number; readonly target: Enemy;
  readonly amount: number; readonly critical: boolean; readonly reach: number;
}): void {
  const state = run.chaos;
  if (!state || !chaosActive(run) || state.mods.general !== "권율") return;
  const { squad, unit, index, target, amount, critical, reach } = attack;
  const general = BPH_GENERALS.find(name => name === squad.general);
  const kind = unit.bph ? BPH_PROFILES[unit.bph.profileId].classId
    : index < 0 ? general && BPH_GENERAL_CLASS[general] : unit.kind;
  if (kind !== "archer" && kind !== "hwacha") return;
  const mods = state.mods;
  state.rangedAttacks++;
  const candidates = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship"
    && distance(enemy, unit) < reach + 16).sort((a, b) => a.id - b.id);
  const start = Math.max(0, candidates.findIndex(enemy => enemy.id === target.id));
  const count = Math.min(mods.arrows, candidates.length);
  for (let ordinal = 0; ordinal < count; ordinal++) {
    const mark = candidates[(start + ordinal) % candidates.length];
    const spread = mods.arrows > 1 ? (ordinal / (mods.arrows - 1) - .5) * mods.spread * Math.PI / 180 : 0;
    const angle = Math.atan2(target.y - unit.y, target.x - unit.x) + spread;
    const power = amount * mods.arrowRatio / mods.arrows;
    run.shots.push({
      id: run.nextId++, kind: "arrow", x: unit.x, y: unit.y, toX: mark.x, toY: mark.y,
      speed: 340, target: mark.id, prey: null, damage: power, critical, by: squad.id,
      unitIndex: index, source: index < 0 ? "general" : unit.kind, attack: "arrow",
      splash: 0, pierce: 0, from: unit.id, tier: 1, flaming: false,
      procDepth: 1, sourceAttackId: state.attacks, chaosDamage: true,
      fanAngle: angle, fanDistance: 12, hitIds: [], retargetRange: mods.retargetRange,
      ...(mods.pierceEvery && state.rangedAttacks % mods.pierceEvery === 0
        ? { chaosPierce: 1, chaosPierceDamage: power * .5 } : {}),
    });
  }
}
