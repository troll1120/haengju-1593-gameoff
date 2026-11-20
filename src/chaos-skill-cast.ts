import { BPH_GENERALS } from "./bph-commanders";
import { generalUpgradeMultiplier } from "./bph-general-upgrades";
import { CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import type { ChaosSkillEvent, ChaosSkillKind } from "./chaos-contract";
import { HEIGHT, WIDTH, fieldPoint, SIDES } from "./geometry";
import type { Point } from "./geometry";
import { CHARGE_SPEED, GENERAL_GROWTH, chargeRadius, might } from "./rules";
import type { Effect, Run, Squad } from "./rules";
import { SKILL_NAMES } from "./roster";
import type { General } from "./roster";
import { chaosState } from "./chaos-state";
import { growthFor } from "./skill-growth";
import { sharedLevel } from "./general-reach";
import { cannonOrigin, cannonTargets, cloneSweeps, militiaSpawn, passiveSideTargets, screenRadius, shipRoute, shipTargets, skillArea, skillLocations } from "./chaos-skill-geometry";

const KINDS = { 권율: "arrows", 신립: "clones", 송상현: "thunder", 황진: "stomps",
  곽재우: "militia", 이순신: "ships", 김시민: "cannon", 사명대사: "bell" } as const;

/** Replacement casts own their banner; augmented casts retain the native banner. */
export function replacementSkill(run: Run, squad: Squad): boolean {
  return squad.general === "송상현" || squad.general === "김시민" || squad.general === "사명대사"
    || (chaosLevel(run, squad.general) > 0 && (squad.general === "곽재우" || squad.general === "이순신"));
}

function chaosLevel(run: Run, general: General): number {
  if (run.bph && run.commander === general) chaosState(run);
  // Every general of the run casts at the shared level, a joined one included; only where no pool runs does the purchase count stand in.
  return sharedLevel(run) ?? growthFor(general, run).level;
}

/** Plans real actors, not visual copies. All deadlines are integer simulation ticks. `army` is flat damage every hit of this
 *  cast lands on top of its own power (김시민's Lv20 battery, chaos-support.ts); 0 everywhere else. */
export function castChaosSkill(run: Run, squad: Squad, effects: Effect[], passive = false, army = 0): void {
  const general = BPH_GENERALS.find(name => name === squad.general);
  if (!general) return;
  const level = chaosLevel(run, general);
  if (!level && general !== "신립" && general !== "송상현" && general !== "김시민" && general !== "사명대사") return;
  const band = chaosSkillBand(level), kind: ChaosSkillKind = KINDS[general], rules = CHAOS_RULES.skills;
  const lane = kind === "clones" ? squad.lane : null;
  if (kind === "clones" && !lane) return;
  const length = lane ? Math.hypot(lane.toX - lane.homeX, lane.toY - lane.homeY) : 0;
  // The cast lands inside the band's box around the general; it widens band by band to the whole field.
  const reach = rules.area[band], area = skillArea(squad, reach);
  const state = run.chaosSkills ??= { tick: 0, remainder: 0, events: [] };
  const castId = run.nextId++;
  // Inside a band each level still adds +3% skill damage (Lv20 = x1.57); reach and counts change only at band edges.
  const scale = might(run) * (1 + GENERAL_GROWTH.skill * (squad.tier - 1)) * (1 + squad.awakened * .25) * (1 + .03 * Math.max(0, level - 1))
    * (run.bph?.survival ? BPH_SURVIVAL_TABLE.generalSkill : 1)
    * (passive ? 1 : generalUpgradeMultiplier(run.meta.generalUpgrades, general, "skill"));
  let count = 1, waves = 1, interval = 0, flight = 1, radius = 0, power = 0, push = 0, stun = 0, arc = 0;
  switch (kind) {
    case "arrows":
      count = rules.columns * rules.rows; waves = rules.arrows.waves[band]; interval = rules.arrows.interval;
      flight = rules.arrows.flight; radius = Math.hypot(WIDTH / rules.columns, HEIGHT / rules.rows) * rules.arrows.radiusScale[band];
      power = rules.arrows.power[band]; arc = rules.arrows.arc; break;
    case "clones":
      count = rules.clones.count[band]; radius = chargeRadius(run, squad);
      flight = Math.max(1, Math.ceil(length / CHARGE_SPEED * CHAOS_RULES.simulationHz));
      power = rules.clones.power[band]; push = rules.clones.push; break;
    case "thunder":
      count = rules.thunder.count[band]; waves = rules.thunder.waves[band]; interval = rules.thunder.interval;
      flight = rules.thunder.flight; radius = rules.thunder.radius[band]; power = rules.thunder.power[band]; break;
    case "stomps":
      count = rules.stomps.count[band]; waves = rules.stomps.waves[band]; interval = rules.stomps.interval;
      flight = rules.stomps.flight; radius = rules.stomps.radius[band]; power = rules.stomps.power[band]; break;
    case "militia":
      count = rules.militia.count[band]; waves = rules.militia.waves[band]; interval = rules.militia.interval;
      flight = rules.militia.lifetime[band]; radius = rules.militia.radius; power = rules.militia.power[band]; break;
    case "ships":
      count = rules.ships.count[band]; waves = rules.ships.waves[band]; interval = rules.ships.interval;
      flight = rules.ships.travel; radius = rules.ships.width / 2; power = rules.ships.power[band]; push = rules.ships.push; break;
    case "cannon":
      // A passive volley serves every standing gun (a side's count of them per wall side); tickChaosSkills assigns each
      // side its own targets at launch and drops the sides with no enemy in passiveReach, so only live guns fire.
      count = rules.cannon.count[band] * (passive ? SIDES.length : 1); waves = passive ? 1 : rules.cannon.waves[band]; interval = rules.cannon.interval;
      flight = rules.cannon.flight; radius = rules.cannon.radius[band]; power = rules.cannon.power[band] * (passive ? rules.cannon.passiveScale : 1);
      push = rules.cannon.push; arc = rules.cannon.arc; break;
    case "bell":
      waves = passive ? 1 : rules.bell.waves[band]; interval = rules.bell.interval; flight = rules.bell.expand;
      // The bell rings around 사명대사 himself; at the top band its ring reaches the field's farthest corner, lower bands stop at the band's reach.
      radius = Math.min(screenRadius(squad), reach) * rules.bell.radiusScale[band]; power = rules.bell.power[band] * (passive ? rules.bell.passiveScale : 1);
      stun = passive ? rules.bell.passiveStun : rules.bell.stun; break;
  }
  if (kind !== "clones") radius *= 1 + (run.bph?.generalMastery?.radiusBonus ?? 0);
  const sweeps = lane ? cloneSweeps(run, castId, count, length) : [];
  const passiveSides = passive && kind === "cannon" ? passiveSideTargets(run, count / SIDES.length) : undefined;
  for (let wave = 0; wave < waves; wave++) {
    const grid = lane ? sweeps.map(sweep => sweep.to) : skillLocations(run, count, wave, kind !== "arrows", area);
    const locations = kind === "cannon" ? cannonTargets(run, grid, area)
      : kind === "ships" && Number.isFinite(reach) ? shipTargets(run, squad, grid, wave) : grid;
    const hits: number[] = [];
    for (let ordinal = 0; ordinal < count; ordinal++) {
      const startedTick = state.tick + wave * interval;
      let to = locations[ordinal], from: Point = { x: to.x, y: to.y };
      let travel = flight, divisor = waves;
      switch (kind) {
        case "arrows": from = { x: to.x, y: to.y - arc }; break;
        case "thunder": from = { x: to.x, y: 0 }; break;
        case "stomps": break;
        case "cannon": {
          if (passiveSides) {
            // Every standing gun fires at its own side's foes: this ordinal's gun belongs to side SIDES[side] and takes that
            // side's nearest cluster; a silent side reserves no shell at all.
            const per = count / SIDES.length, centers = passiveSides[Math.floor(ordinal / per)]!;
            if (!centers.length) continue;
            to = fieldPoint(run.fort, centers[ordinal % centers.length], 12);
            from = cannonOrigin(run, to, ordinal % per, per);
          } else from = cannonOrigin(run, to, ordinal, count);
          break;
        }
        case "bell": from = { x: squad.x, y: squad.y }; to = { x: squad.x, y: squad.y }; break;
        case "clones": {
          from = sweeps[ordinal].from;
          divisor *= count; break;
        }
        // Every pass crosses the whole field through its target (Lv1 clipped to the 110 px box sailed empty water, seed 1593).
        case "ships": ({ from, to } = shipRoute(to, ordinal + wave)); divisor *= count; break;
        case "militia":
          from = militiaSpawn(run, { at: to, ordinal, count, wave, startedTick,
            untilTick: startedTick + travel + rules.afterTicks, area });
          to = { ...from };
          divisor *= count * (rules.militia.lifetime[band] / rules.militia.attackEvery);
          break;
      }
      const event: ChaosSkillEvent = {
        id: run.nextId++, castId, squad: squad.id, general, level, kind, trigger: passive ? "army" : "manual",
        wave, ordinal, from, to, x: from.x, y: from.y,
        startedTick, impactTick: startedTick + travel, untilTick: startedTick + travel + rules.afterTicks,
        nextTick: startedTick + rules.militia.attackEvery, radius, currentRadius: 0, arcHeight: arc,
        power: power * scale / divisor + army, shipPower: rules.ships.shipPower / Math.max(1, count * waves),
        push: push / Math.max(1, kind === "ships" || kind === "clones" ? count * waves : waves), stun,
        hits: kind === "clones" || kind === "ships" || kind === "militia" ? [] : hits, resolved: false,
      };
      state.events.push(event);
    }
  }
  if (!passive && replacementSkill(run, squad)) effects.push({
    kind: "skill", x: squad.x, y: squad.y,
    value: radius, squad: squad.id, label: SKILL_NAMES[squad.general],
  });
}
