import { BPH_GENERAL_CLASS, BPH_GENERALS } from "./bph-general-roster";
import type { BphGeneral } from "./bph-general-roster";
import type { BphClass } from "./bph-contract";
import type { Run } from "./rules";

type Command = {
  readonly attackSpeed?: number;
  readonly moveSpeed?: number;
  readonly attack?: number;
  readonly range?: number;
  readonly health?: number;
  readonly damageReduction?: number;
  readonly militiaCap?: readonly number[];
  readonly ko: string;
  readonly en: string;
};

const fireRate = (bonus: number, ko: string, en: string): Command => ({
  attackSpeed: bonus / 100, ko: `${ko} 공격 속도 +${bonus}%`, en: `${en} fire rate +${bonus}%`,
});

const COMMANDS: Readonly<Record<BphGeneral, Command>> = {
  권율: fireRate(10, "화차병", "Hwacha"),
  신립: { moveSpeed: .10, attack: .08, ko: "기병 이동 속도 +10% · 공격력 +8%", en: "Cavalry: speed +10%, attack +8%" },
  송상현: { range: .10, ko: "궁수 사거리 +10%", en: "Archers: range +10%" },
  황진: { health: .12, ko: "창병 체력 +12%", en: "Spearmen: HP +12%" },
  김시민: { attack: .10, ko: "총통병 공격력 +10%", en: "Gunners: attack +10%" },
  곽재우: { militiaCap: [0, 1, 2, 3], ko: "의병 기세 상한 +1/2/3명", en: "Militia momentum cap +1/2/3" },
  사명대사: { damageReduction: .10, ko: "승병 피해 감소 +10%p", en: "Monks: damage reduction +10pp" },
  이순신: fireRate(10, "판옥선", "Panokseon"),
};

const leadersByClass = new Map<BphClass, BphGeneral>(
  BPH_GENERALS.map(general => [BPH_GENERAL_CLASS[general], general]),
);

/** Starting and joined generals command their class for as long as they are in the run. */
export function bphFieldCommand(run: Run, troop: BphClass): Command | undefined {
  if (!run.bph) return;
  const general = leadersByClass.get(troop);
  if (general && run.squads.some(squad => squad.general === general))
    return COMMANDS[general];
}

export function bphMilitiaMomentumCap(run?: Run): number {
  const stage = run?.bph?.save.unitUpgrades.Hero1_Barbarian?.special ?? 0;
  return 5 + (run ? bphFieldCommand(run, "militia")?.militiaCap?.[stage] ?? 0 : 0);
}

export function bphCommandLine(general: BphGeneral, lang: "ko" | "en"): string {
  return COMMANDS[general][lang];
}
