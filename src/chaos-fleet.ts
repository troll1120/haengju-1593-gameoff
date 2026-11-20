import type { ChaosAttack, ChaosContext } from "./chaos-contract";
import { CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import { might } from "./rules";
import { fleetLanes } from "./skills-fleet-targets";
import { noteFleetResults } from "./skill-holds";

/** At Lv20 the fleet rides the army: the blows the army lands between two sorties are tallied for the next one
 *  (CHAOS_RULES.fleet.armyRatio). Called after the parent counts the attack. */
export function chaosFleetAttack(ctx: ChaosContext, attack: ChaosAttack): void {
  const { state } = ctx;
  if (ctx.run.phase !== "playing" || state.mods.general !== "이순신") return;
  if (CHAOS_RULES.fleet.armyRatio[chaosSkillBand(state.level)]) state.blows = (state.blows ?? 0) + attack.amount;
}

/** Called once per integer 30Hz tick, including while the commander is down. */
export function tickChaosFleet(ctx: ChaosContext, active: boolean): void {
  const { run, state, squad, combat } = ctx;
  if (run.phase !== "playing") {
    state.fleet.length = 0;
    return;
  }
  const mods = state.mods;
  if (state.level === 0 || mods.general !== "이순신") return;
  state.fleet = state.fleet.filter(pass => state.tick < pass.untilTick);
  if (active && state.tick >= state.nextFleetTick) {
    state.nextFleetTick = state.tick + mods.every;
    const land = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship")
      .sort((a, b) => a.y - b.y || a.id - b.id);
    const lanes = fleetLanes(land, state.level >= 20 ? 3 : 1, mods.width);
    const shipIds = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind === "ship")
      .sort((a, b) => a.id - b.id).map(enemy => enemy.id);
    // The sortie lands armyRatio of the army's blows since the last one on top of its own landPower, split over its passes.
    const ratio = CHAOS_RULES.fleet.armyRatio[chaosSkillBand(state.level)], army = (state.blows ?? 0) * ratio;
    if (ratio) state.blows = 0;
    const power = might(run);
    for (let index = 0; index < mods.passes; index++) {
      const lane = lanes[index % lanes.length];
      const dueTick = state.tick + index * CHAOS_RULES.fleet.passTicks;
      state.fleet.push({
        id: run.nextId++, lane, width: mods.width, dueTick,
        untilTick: dueTick + CHAOS_RULES.fleet.passTicks + CHAOS_RULES.fleet.afterimageTicks,
        landIds: land.filter(enemy => Math.abs(enemy.y - lane) <= mods.width / 2).map(enemy => enemy.id),
        shipIds: [...shipIds], landPower: (mods.landPower * power + army) / mods.passes,
        shipPower: mods.shipPower / mods.passes, push: CHAOS_RULES.fleet.pushPixels / mods.passes, resolved: false,
      });
    }
  }
  for (const pass of state.fleet) {
    if (pass.resolved || state.tick < pass.dueTick) continue;
    pass.resolved = true;
    const firstResult = ctx.effects.length;
    for (const id of pass.shipIds) {
      const enemy = run.enemies.find(target => target.id === id && target.hp > 0);
      if (enemy) combat.applyDamage({ target: enemy, amount: pass.shipPower, source: squad, spellId: "chaos:fleet" });
    }
    for (const id of pass.landIds) {
      const enemy = run.enemies.find(target => target.id === id && target.hp > 0);
      if (!enemy) continue;
      combat.applyDamage({ target: enemy, amount: pass.landPower, source: squad, spellId: "chaos:fleet" });
      combat.knock(enemy, { x: enemy.x - 1, y: enemy.y }, pass.push);
    }
    noteFleetResults(pass, ctx.effects.slice(firstResult));
  }
}
