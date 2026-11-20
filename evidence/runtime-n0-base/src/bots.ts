import { advance, autoCard, BALANCE, choose, chooseGeneral, covers, createRun, fielded, GENERALS, skillAim, upgradeClass, useSkill } from "./rules";
import type { CardId, Run, Squad } from "./rules";
import { distance, fortRect, gapToRect } from "./geometry";
import { cardRarity } from "./cards";
import type { MetaBonuses } from "./meta";

export type Policy = { skills: "never" | "late" | "always" | "timed"; cards: "best" | "random" | "none"; spend: boolean };
const CLASSES = ["archer", "hwacha", "spearman", "monk"] as const;
export const POLICIES = {
  idle: { skills: "never", cards: "none", spend: false },
  sloppy: { skills: "late", cards: "random", spend: false },
  mash: { skills: "always", cards: "best", spend: true },
  timed: { skills: "timed", cards: "best", spend: true },
} satisfies Record<string, Policy>;

export function skillReason(run: Run, squad: Squad, policy: Policy, lead = 0): string | null {
  if (policy.skills === "never" || !fielded(squad) || squad.skillClock > 0) return null;
  const aim = skillAim(run, squad.id);
  if (!aim) return null;
  if (policy.skills === "always") return "충전되자마자";
  const held = run.time - Math.max(0, squad.usedAt) - BALANCE.cooldown[squad.general];
  if (policy.skills === "late") return held > 8 ? "한참 뒤에 누름" : null;
  if (squad.general === "권율")
    return aim.weight >= Math.max(7, Math.min(14, run.enemies.length / 6)) || (held > 5 && aim.count >= 3) ? `적 ${aim.count}명이 뭉침` : null;
  if (squad.general === "김시민") {
    const due = run.telegraphs.find(mark => mark.at - run.time < .5 + lead && (mark.wallDamage >= 40 || run.squads.some(mate => fielded(mate) && covers(mark, mate))));
    if (due) return "적 스킬이 떨어지기 직전";
    if (run.squads.some(mate => fielded(mate) && mate.hp < mate.maxHp * .45)) return "장수가 위험";
    const wall = fortRect(run.fort);
    if (run.enemies.some(enemy => enemy.ladder && gapToRect(wall, enemy) < 40 && enemy.clock < .5)) return "사다리병 타격 직전";
    return run.enemies.filter(enemy => gapToRect(wall, enemy) < 30).length >= 28 ? "성벽에 적이 몰림" : null;
  }
  if (aim.urgent) return "적 스킬 끊기";
  if (aim.count > 0 && run.enemies.some(enemy => enemy.ladder && distance(enemy, squad) < 120)) return "사다리병 저지";
  if (held < 4 && run.enemies.some(enemy => enemy.boss || enemy.elite)) return null;
  return aim.weight >= 2000 ? "보스·정예에게 돌격" : aim.count >= 5 ? `적 ${aim.count}명을 꿰뚫음` : null;
}
/** Prefer ordinary choices; a hand containing only legends must still be answerable. */
export function ordinaryCard(run: Run): CardId {
  const offers = run.offers.filter(card => cardRarity(card) !== "legend");
  return autoCard(offers.length ? { ...run, offers } : run);
}
export function play(policy: Policy, seed: number, dt = .05, meta?: MetaBonuses): Run {
  const run = createRun(seed, "권율", meta, GENERALS.slice(0, 3));
  let nextLook = 0, decisions = seed >>> 0;
  for (let step = 0; step < 60000 && !["won", "lost"].includes(run.phase); step++) {
    if (run.phase === "choice" && policy.cards !== "none" && run.offers.length) {
      decisions = (Math.imul(decisions, 1664525) + 1013904223) >>> 0;
      choose(run, policy.cards === "random" ? run.offers[decisions % run.offers.length] : ordinaryCard(run));
    }
    else if (run.phase === "general") chooseGeneral(run, run.generalOffers[0]);
    else {
      if (run.time >= nextLook) {
        nextLook = run.time + .2;
        for (const squad of run.squads) if (skillReason(run, squad, policy)) useSkill(run, squad.id);
        if (policy.spend) for (const kind of [...CLASSES].sort((a, b) => run.drill[a] - run.drill[b])) upgradeClass(run, kind);
      }
      advance(run, dt);
    }
  }
  return run;
}
