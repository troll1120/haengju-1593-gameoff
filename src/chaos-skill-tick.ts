import { CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import type { ChaosSkillEvent } from "./chaos-contract";
import { CENTER, allyRoute, crosses, distance, fieldPoint, fortGates, fortRect } from "./geometry";
import type { Point } from "./geometry";
import { bphEffectCombat, ladderHp, stagger } from "./rules";
import type { Effect, Enemy, Run } from "./rules";
import { riverBank } from "./river";
import { cannonOrigin, cannonTargets, screenRadius, segmentGap, skillArea } from "./chaos-skill-geometry";
import { chaosHitXp } from "./chaos-growth";

function strike(run: Run, event: ChaosSkillEvent, enemy: Enemy, effects: Effect[], from: Point): void {
  const source = run.squads.find(squad => squad.id === event.squad);
  const combat = bphEffectCombat(run, effects);
  // Legacy non-wave ladders gain up to 55x siege HP. Artillery counters that authored armor,
  // rather than replacing the removed shield/decoy with protection or inflating all BPH damage.
  const siegeScale = event.kind === "cannon" && enemy.ladder && !enemy.wave
    ? Math.min(CHAOS_RULES.skills.cannon.siegeScaleCap, ladderHp(run.time)) : 1;
  const dealt = combat.applyDamage({ target: enemy, source, amount: enemy.kind === "ship" ? event.shipPower : event.power * siegeScale,
    spellId: `chaos:${event.trigger}:${event.kind}`, position: from });
  if (dealt <= 0) return;
  if (source) chaosHitXp(run, event.castId, source);
  if (event.push) combat.knock(enemy, from, event.push);
  if (event.stun) stagger(run, enemy, event.stun, effects);
}

function tickMilitia(run: Run, event: ChaosSkillEvent, tick: number, effects: Effect[]): void {
  const rules = CHAOS_RULES.skills.militia;
  // The mob chases the nearest live ground foe anywhere on the field (deterministic distance-then-id order);
  // `reach` stays the drawn strike reach, not an acquisition leash.
  const targets = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship" && enemy.y <= riverBank() - 8)
    .sort((a, b) => distance(event, a) - distance(event, b) || a.id - b.id);
  const target = targets[0];
  if (target && distance(event, target) > event.radius) {
    const next = allyRoute(run.fort, event, fieldPoint(run.fort, target, 12), 12, fortGates(!!run.bph));
    const gap = distance(event, next), step = Math.min(gap, rules.speed / CHAOS_RULES.simulationHz);
    if (gap > 0) {
      const at = fieldPoint(run.fort, { x: event.x + (next.x - event.x) / gap * step,
        y: event.y + (next.y - event.y) / gap * step }, 12);
      event.x = at.x; event.y = Math.min(at.y, riverBank() - 8);
    }
  }
  if (tick < event.nextTick) return;
  event.nextTick += rules.attackEvery;
  event.hits = [];
  if (!target || crosses(fortRect(run.fort), event, target)) return;
  event.to = { x: target.x, y: target.y };
  effects.push({ kind: "swing", x: target.x, y: target.y, fromX: event.x, fromY: event.y, value: 1, by: "spearman" });
  for (const enemy of targets.filter(enemy => distance(enemy, target) <= event.radius
    && !crosses(fortRect(run.fort), event, enemy)).slice(0, 2)) {
    event.hits.push(enemy.id);
    strike(run, event, enemy, effects, event);
  }
}

function tickEvent(run: Run, event: ChaosSkillEvent, tick: number, effects: Effect[]): void {
  if (tick < event.startedTick || event.resolved) return;
  const age = tick - event.startedTick, duration = event.impactTick - event.startedTick;
  const t = Math.min(1, age / duration), previous = { x: event.x, y: event.y };
  switch (event.kind) {
    case "militia":
      tickMilitia(run, event, tick, effects);
      if (tick >= event.impactTick) event.resolved = true;
      return;
    case "clones": case "ships":
      event.x = event.from.x + (event.to.x - event.from.x) * t;
      event.y = event.from.y + (event.to.y - event.from.y) * t;
      break;
    case "bell": {
      // Each toll rings where 사명대사 stands as it starts, so a long cast follows him across the field.
      const caster = event.currentRadius === 0 ? run.squads.find(squad => squad.id === event.squad) : undefined;
      if (caster) { event.from = { x: caster.x, y: caster.y }; event.to = { x: caster.x, y: caster.y }; event.x = caster.x; event.y = caster.y; }
      event.currentRadius = event.radius * t; break;
    }
    case "arrows": case "cannon":
      event.x = event.from.x + (event.to.x - event.from.x) * t;
      event.y = event.from.y + (event.to.y - event.from.y) * t - event.arcHeight * 4 * t * (1 - t);
      if (tick < event.impactTick) return;
      break;
    case "thunder": case "stomps":
      if (tick < event.impactTick) return;
      event.x = event.to.x; event.y = event.to.y;
      break;
  }
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0 || (enemy.kind === "ship" && event.kind !== "ships") || event.hits.includes(enemy.id)) continue;
    const moving = event.kind === "ships" || event.kind === "clones";
    const hit = moving ? segmentGap(enemy, previous, event) <= event.radius
      : event.kind === "bell"
        // Rung where 사명대사 stands, the ring sweeps the same ground the field-wide toll always covered: nothing past that reach.
        ? distance(enemy, event.to) <= event.currentRadius
          && distance(enemy, CENTER) <= screenRadius() * CHAOS_RULES.skills.bell.radiusScale[chaosSkillBand(event.level)]
        : distance(enemy, event.to) <= event.radius;
    if (!hit) continue;
    event.hits.push(enemy.id);
    // A swept body pushes along its actual travel, even when the target is at its center.
    const from = moving ? { x: enemy.x - (event.to.x - event.from.x), y: enemy.y - (event.to.y - event.from.y) }
      : event.kind === "cannon" ? event.from : event.to;
    strike(run, event, enemy, effects, from);
  }
  if (tick >= event.impactTick) {
    event.resolved = true;
  }
}

/** No state allocation or RNG; five unchanged N0 paths return before touching anything. */
export function tickChaosSkills(run: Run, dt: number, effects: Effect[]): void {
  const state = run.chaosSkills;
  if (!state) return;
  if (run.phase === "won" || run.phase === "lost") { state.events = []; return; }
  state.remainder += dt;
  while (state.remainder + 1e-9 >= 1 / CHAOS_RULES.simulationHz) {
    state.remainder -= 1 / CHAOS_RULES.simulationHz;
    state.tick++;
    const launches = new Map<number, ChaosSkillEvent[]>();
    for (const event of state.events) if (event.kind === "cannon" && event.startedTick === state.tick) {
      const wave = launches.get(event.castId);
      if (wave) wave.push(event); else launches.set(event.castId, [event]);
    }
    for (const wave of launches.values()) {
      // A passive volley was aimed at its own cast (passiveSideTargets): each side's guns at that side's foes, the silent
      // sides never reserved. Only a manual barrage retargets here.
      if (wave[0].trigger === "army") continue;
      const caster = run.squads.find(squad => squad.id === wave[0].squad);
      const area = caster ? skillArea(caster, CHAOS_RULES.skills.area[chaosSkillBand(wave[0].level)]) : undefined;
      const targets = cannonTargets(run, wave.map(event => event.to), area);
      for (const [index, event] of wave.entries()) {
        event.to = targets[index];
        event.from = cannonOrigin(run, event.to, event.ordinal, wave.length);
        event.x = event.from.x; event.y = event.from.y;
      }
    }
    for (const event of state.events) tickEvent(run, event, state.tick, effects);
    state.events = state.events.filter(event => state.tick < event.untilTick);
  }
  const paid = run.chaos?.hitXp;
  if (paid) for (const id of Object.keys(paid)) if (!state.events.some(event => event.castId === Number(id))) delete paid[Number(id)];
}
