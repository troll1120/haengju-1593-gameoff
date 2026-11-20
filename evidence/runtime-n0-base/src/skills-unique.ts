import { CENTER, contains, crosses, distance, fieldPoint, fortRect, gapToRect, guardPoint, sideOf } from "./geometry";
import type { Point } from "./geometry";
import { BALANCE, GENERAL_GROWTH, might, stagger } from "./rules";
import type { Aim, Effect, Enemy, Run, Squad } from "./rules";
import { SKILL_NAMES } from "./roster";
import type { General } from "./roster";
import { riverBank } from "./river";

export type UniqueSkillMods = { readonly lineLengthBonus?: number; readonly militiaCountBonus?: number;
  readonly lineHalfWidth?: number; readonly lineSeconds?: number; readonly linePowerScale?: number };
type Cast = { readonly run: Run; readonly squad: Squad; readonly aim: Point };
type Lifetime = { readonly id: number; readonly squad: number; readonly startedAt: number; readonly until: number; readonly power: number; nextAt: number };
export type DongnaeLine = Lifetime & { readonly kind: "hold"; readonly from: Point; readonly to: Point; readonly halfWidth?: number };
export type Militia = Point & { aimX: number; aimY: number; struckAt: number };
export type MilitiaAmbush = Lifetime & { readonly kind: "ambush"; readonly members: Militia[] };
export type UniqueSkill = DongnaeLine | MilitiaAmbush;

export const UNIQUE_SKILL_DESCRIPTIONS: Partial<Record<General, string>> = {
  송상현: "5초간 성벽 앞 방어선을 세워 통과하는 적을 40% 느리게 하고 가벼운 피해를 줍니다.",
  곽재우: "의병 4명이 3초간 매복합니다. 등장하며 주변 적을 1초 기절시키고 사다리병을 유인하며 두 번씩 공격합니다.",
};

/** An ambush protects the wall first, then disrupts a caster, then attacks the nearest threatening crowd. */
export function militiaAim(run: Run): Aim | null {
  const targets = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship"), wall = fortRect(run.fort);
  let best: Aim | null = null;
  for (const target of targets) {
    const count = targets.filter(enemy => distance(target, enemy) < 72).length;
    const priority = target.ladder && gapToRect(wall, target) < 140 ? 4000 : target.casting ? 3000 : target.boss ? 2000 : target.elite ? 1000 : 0;
    const weight = priority + count - gapToRect(wall, target) / 1000;
    if (!best || weight > best.weight) {
      const gap = Math.max(1, distance(target, CENTER)), outward = target.ladder ? 40 : 0;
      const desired = { x: target.x + (target.x - CENTER.x) / gap * outward,
        y: target.y + (target.y - CENTER.y) / gap * outward };
      const at = contains(fortRect(run.fort, -16), desired) ? desired : fieldPoint(run.fort, desired, 12);
      best = { ...at, toX: at.x, toY: at.y, count, weight, urgent: target.casting > 0 };
    }
  }
  return best;
}

/** A finite strip outside the threatened wall, independent of the caster's movement. */
export function holdDongnae({ run, squad, aim }: Cast, mods: UniqueSkillMods = {}): Effect[] {
  const side = sideOf(fortRect(run.fort), aim), center = guardPoint(run.fort, side, 40);
  const half = (144 + (mods.lineLengthBonus ?? 0)) / 2, horizontal = side === "위" || side === "아래";
  const from = { x: center.x - (horizontal ? half : 0), y: center.y - (horizontal ? 0 : half) };
  const to = { x: center.x + (horizontal ? half : 0), y: center.y + (horizontal ? 0 : half) };
  (run.uniqueSkills ??= []).push({ kind: "hold", id: run.nextId++, squad: squad.id, startedAt: run.time,
    until: run.time + (mods.lineSeconds ?? 5), nextAt: run.time + .5,
    power: 1.08 * might(run) * (1 + squad.awakened * .25) * (1 + GENERAL_GROWTH.skill * (squad.tier - 1))
      * (mods.linePowerScale ?? 1), from, to,
    ...(mods.lineHalfWidth === undefined ? {} : { halfWidth: mods.lineHalfWidth }) });
  return [{ kind: "skill", x: center.x, y: center.y, value: half, squad: squad.id, label: SKILL_NAMES[squad.general] }];
}

/** Summons are skill actors, not recruitable soldiers or persistent economy units. */
export function militiaAmbush({ run, squad, aim }: Cast, mods: UniqueSkillMods = {}): Effect[] {
  const count = 4 + (mods.militiaCountBonus ?? 0);
  const members = Array.from({ length: count }, (_, index) => {
    const angle = index * Math.PI * 2 / count;
    const desired = { x: aim.x + Math.cos(angle) * 24, y: aim.y + Math.sin(angle) * 24 };
    const at = contains(fortRect(run.fort, -16), desired) ? desired : fieldPoint(run.fort, desired, 12);
    return { x: at.x, y: Math.min(at.y, riverBank() - 8), aimX: aim.x, aimY: aim.y, struckAt: -100 };
  });
  (run.uniqueSkills ??= []).push({ kind: "ambush", id: run.nextId++, squad: squad.id, startedAt: run.time,
    until: run.time + 3, nextAt: run.time + .3,
    power: .7 * might(run) * (1 + GENERAL_GROWTH.skill * (squad.tier - 1)), members });
  const effects: Effect[] = [{ kind: "skill", x: aim.x, y: aim.y, value: 72, squad: squad.id, label: SKILL_NAMES[squad.general] }];
  for (const enemy of run.enemies) if (enemy.hp > 0 && enemy.kind !== "ship" && distance(enemy, aim) < 72)
    stagger(run, enemy, 1, effects);
  return effects;
}

export function onLine(line: DongnaeLine, point: Point): boolean {
  return point.x >= Math.min(line.from.x, line.to.x) - (line.from.x === line.to.x ? line.halfWidth ?? 16 : 0)
    && point.x <= Math.max(line.from.x, line.to.x) + (line.from.x === line.to.x ? line.halfWidth ?? 16 : 0)
    && point.y >= Math.min(line.from.y, line.to.y) - (line.from.y === line.to.y ? line.halfWidth ?? 16 : 0)
    && point.y <= Math.max(line.from.y, line.to.y) + (line.from.y === line.to.y ? line.halfWidth ?? 16 : 0);
}

/** Multiplication at movement time never permanently mutates enemy.speed or stacks lines. */
export function uniqueSkillSpeed(run: Run, enemy: Enemy): number {
  return enemy.kind !== "ship" && run.uniqueSkills?.some(skill =>
    skill.kind === "hold" && run.time < skill.until && onLine(skill, enemy)) ? .6 : 1;
}

/** Ladder carriers attack the nearest decoy while it lives, then resume their original wall goal. */
export function militiaLure(run: Run, enemy: Enemy): Point | undefined {
  const wall = fortRect(run.fort);
  let closest: Point | undefined, nearest = 120;
  for (const skill of run.uniqueSkills ?? []) if (skill.kind === "ambush" && run.time < skill.until)
    for (const member of skill.members) {
      if (!(contains(wall, enemy) && contains(wall, member)) && crosses(wall, enemy, member)) continue;
      const gap = distance(enemy, member);
      if (gap < nearest) { nearest = gap; closest = member; }
    }
  for (const member of run.chaos?.militia ?? []) {
    if (!(contains(wall, enemy) && contains(wall, member)) && crosses(wall, enemy, member)) continue;
    const gap = distance(enemy, member);
    if (gap < nearest) { nearest = gap; closest = member; }
  }
  return closest;
}

/** Fixed simulation deadlines, stable nearest/id ordering, and native combat damage. */
export function tickUniqueSkills(run: Run, effects: Effect[], strike: (enemy: Enemy, amount: number, from: Point) => void): void {
  if (!run.uniqueSkills) return;
  for (const skill of run.uniqueSkills) {
    while (skill.nextAt <= run.time + 1e-9 && skill.nextAt < skill.until) {
      const at = skill.nextAt;
      skill.nextAt += skill.kind === "ambush" ? 1.5 : 1;
      switch (skill.kind) {
        case "hold":
          for (const enemy of run.enemies) if (enemy.hp > 0 && enemy.kind !== "ship" && onLine(skill, enemy)
            && !(run.chaos?.general === "송상현" && run.uniqueSkills.some(other =>
              other.kind === "hold" && run.time < other.until && onLine(other, enemy)
              && (other.power > skill.power || other.power === skill.power && other.id < skill.id))))
            strike(enemy, skill.power, { x: (skill.from.x + skill.to.x) / 2, y: (skill.from.y + skill.to.y) / 2 });
          break;
        case "ambush":
          for (const member of skill.members) {
            const target = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && distance(member, enemy) < 72)
              .sort((a, b) => distance(member, a) - distance(member, b) || a.id - b.id)[0];
            if (!target) continue;
            member.aimX = target.x; member.aimY = target.y; member.struckAt = at;
            effects.push({ kind: "swing", x: target.x, y: target.y, fromX: member.x, fromY: member.y, value: 1, by: "spearman" });
            const cleave = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && distance(enemy, target) <= 18)
              .sort((a, b) => distance(member, a) - distance(member, b) || a.id - b.id).slice(0, 2);
            for (const enemy of cleave) strike(enemy, skill.power, member);
          }
          break;
      }
    }
    if (skill.kind === "ambush" && run.time + 1e-9 >= skill.until) {
      const squad = run.squads[skill.squad];
      if (squad.awakened >= 1) squad.frenzyUntil = run.time + BALANCE.frenzySeconds;
    }
  }
  run.uniqueSkills = run.uniqueSkills.filter(skill => run.time + 1e-9 < skill.until);
}
