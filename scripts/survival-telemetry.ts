import type { BphFxEvent } from "../src/bph-contract";
import type { BphCast } from "../src/bph-effects-entry";
import type { Enemy, Run, Squad, Unit } from "../src/rules";

const checkpoints = [180, 300, 600, 900] as const;
// Repeated .05 advances can leave the exact 900-second win slightly below 900.
const timeTolerance = 1e-6;
const sources = ["generalAttack", "generalSkill", "generalOngoing", "troops", "cursor", "unassigned"] as const;
type Source = typeof sources[number];
type Hit = Extract<BphFxEvent, { kind: "damage-dealt" }>;
type Input = "advance" | "cursor" | "portrait";
type Totals = { [K in Source]: { hp: number; kills: number } };
const totals = (): Totals => ({
  generalAttack: { hp: 0, kills: 0 }, generalSkill: { hp: 0, kills: 0 },
  generalOngoing: { hp: 0, kills: 0 }, troops: { hp: 0, kills: 0 },
  cursor: { hp: 0, kills: 0 }, unassigned: { hp: 0, kills: 0 },
});

function classify(hit: Hit, input: Input, inConsumer: boolean, caster?: Unit): Source {
  if (hit.spellId === "CursorDps" ||
    (hit.cast?.sourceId === null && (hit.cast.tomeId === "Tome_Thunderstorm" || hit.cast.tomeId === "Tome_Earthquake")))
    return "cursor";
  // Delayed spells can outlive the fighter. A cast records its original owner.
  const owner = caster ?? hit.source;
  if (owner?.kind === "general") {
    if (hit.spellId?.startsWith("chaos:manual:"))
      return input === "portrait" ? "generalSkill" : "generalOngoing";
    if (hit.spellId || inConsumer || input === "cursor") return "generalOngoing";
    return input === "portrait" ? "generalSkill" : "generalAttack";
  }
  if (owner && !("boss" in owner)) return "troops";
  if (input === "cursor" && !inConsumer && !hit.spellId) return "cursor";
  return "unassigned";
}

export function survivalTelemetry(run: Run) {
  const bySource = totals();
  const casters = new WeakMap<BphCast, Unit>();
  const finalBlows = new WeakMap<Enemy, Source>();
  const joined = new Map<Squad, number>();
  let enemyHpLost = 0, killReceipts = 0, transportSinks = 0, armyContributionHp = 0;
  const sampleGeneral = (squad: Squad) => ({
    squad: squad.id, general: squad.general, joinedAt: joined.get(squad) ?? null,
    level: run.chaos?.level ?? null,
    down: squad.state === "down", falls: squad.downs,
  });
  const generalCheckpoints: {
    checkpoint: number; time: number; sharedLevel: number | null;
    lead: ReturnType<typeof sampleGeneral> | null;
    generals: ReturnType<typeof sampleGeneral>[];
  }[] = [];
  let next = 0;
  const sample = () => {
    for (const squad of run.squads) {
      if (!joined.has(squad)) joined.set(squad, squad.id === 0 ? 0 : run.metrics.generalTimes[squad.id - 1] ?? run.time);
    }
    while (next < checkpoints.length && run.time + timeTolerance >= checkpoints[next]) {
      const generals = run.squads.map(sampleGeneral);
      generalCheckpoints.push({ checkpoint: checkpoints[next++], time: run.time, sharedLevel: run.chaos?.level ?? null,
        lead: generals.find(general => general.squad === 0) ?? null, generals });
    }
  };
  return {
    sample,
    event(event: BphFxEvent, input: Input, inConsumer: boolean) {
      if (event.kind === "spellCast" && event.cast && event.source) casters.set(event.cast, event.source);
      if (event.kind === "damage-dealt" && event.side === "enemy" && event.dealt > 0 && "boss" in event.target) {
        const source = classify(event, input, inConsumer, event.cast && casters.get(event.cast));
        bySource[source].hp += event.dealt;
        enemyHpLost += event.dealt;
        armyContributionHp += event.armyContribution ?? 0;
        if (event.target.hp <= 0) finalBlows.set(event.target, source);
      }
      if (event.kind === "enemy-killed") {
        const source = finalBlows.get(event.enemy) ?? "unassigned";
        finalBlows.delete(event.enemy);
        // The game counts passengers of a sunk transport, rather than the hull.
        if (event.enemy.cargo) { transportSinks++; return; }
        killReceipts++;
        bySource[source].kills++;
      }
    },
    result() {
      // Deaths without a kill receipt (for example passengers and rout cleanup)
      // contribute to the game's kill total, with no individual final blow.
      const killsWithoutReceipt = run.kills - killReceipts;
      return {
        combat: { bySource: { ...bySource, unassigned: { ...bySource.unassigned,
          kills: bySource.unassigned.kills + killsWithoutReceipt } },
          enemyHpLost, kills: run.kills, killReceipts, killsWithoutReceipt, transportSinks,
          assignedHp: enemyHpLost - bySource.unassigned.hp,
          assignedKills: run.kills - bySource.unassigned.kills - killsWithoutReceipt,
          armyContributionHp },
        generalCheckpoints, generals: run.squads.map(sampleGeneral), generalFalls: [...run.metrics.downs],
      };
    },
  };
}
