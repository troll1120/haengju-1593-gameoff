import type { Enemy, Skill } from "./rules";

export const MINIBOSS = {
  scale: 1.5, hp: 6, damage: 1.65, reward: 3,
  firstAt: 75, middleAt: 300, lateAt: 600,
  interval: 75, middleInterval: 65, lateInterval: 55,
  initialCast: 1.5, cooldown: 8, wallReach: 38, wallSkillScale: .05,
} as const;

export const MINIBOSS_TYPES = [
  { kind: "yari", profileId: "Monster1_Raider", skill: "spear-thrust", power: 2.2, wall: 24 },
  { kind: "teppo", profileId: "Monster6_Spider", skill: "salvo", power: 2.4, wall: 50 },
  { kind: "samurai", profileId: "Monster4_Bandit", skill: "spin-slash", power: 2.5, wall: 30 },
  { kind: "cavalry", profileId: "Monster3_Shadow", skill: "cavalry", power: 2.8, wall: 34 },
  { kind: "guard", profileId: "Monster4_Sentinel", skill: "shield", power: 1.25, wall: 18 },
] as const satisfies readonly { kind: Enemy["kind"]; profileId: string; skill: Skill; power: number; wall: number }[];

export type MinibossSkill = typeof MINIBOSS_TYPES[number]["skill"];
export const minibossCast = (skill: MinibossSkill) => MINIBOSS_TYPES.find(type => type.skill === skill)!;

function nextMinibossAt(at: number): number {
  return at + (at >= MINIBOSS.lateAt ? MINIBOSS.lateInterval
    : at >= MINIBOSS.middleAt ? MINIBOSS.middleInterval : MINIBOSS.interval);
}

export function minibossBeat(after: number, through: number): { at: number; index: number } | undefined {
  for (let at: number = MINIBOSS.firstAt, index = 0; at <= through + 1e-9; at = nextMinibossAt(at), index++)
    if (at > after + 1e-9) return { at, index };
}

export const minibossScale = (enemy: Pick<Enemy, "miniboss">): number => enemy.miniboss ? MINIBOSS.scale : 1;
export const minibossDamage = (enemy: Pick<Enemy, "miniboss">): number => enemy.miniboss ? MINIBOSS.damage : 1;
export const minibossPadding = (enemy: Pick<Enemy, "miniboss">, radius: number): number => radius * (minibossScale(enemy) - 1);
