import type { Point } from "./geometry";
import { WIDTH } from "./geometry";
import { fleetLanes } from "./skills-fleet-targets";
import { BALANCE, GENERAL_GROWTH, might } from "./rules";
import type { Effect, Enemy, Run, Squad } from "./rules";
import { CHAOS_RULES } from "./chaos-contract";

/** BPH's land lane complements the retained 300-damage transport attack. */
export function castYisunsin(
  run: Run, squad: Squad, effects: Effect[],
  combat: {
    damage(enemy: Enemy, amount: number): void;
    knock(enemy: Enemy, from: Point, pixels: number): void;
  },
  mods: { readonly extraPass?: number } = {},
): void {
  const land = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind !== "ship")
    .sort((a, b) => a.y - b.y);
  const lane = fleetLanes(land, 1)[0];
  const targets = land.filter(enemy => Math.abs(enemy.y - lane) <= CHAOS_RULES.fleet.manualWidth / 2);
  const ships = run.enemies.filter(enemy => enemy.hp > 0 && enemy.kind === "ship");
  const amount = .6083 * BALANCE.cooldown.이순신 * might(run)
    * (1 + squad.awakened * .25) * (1 + GENERAL_GROWTH.skill * (squad.tier - 1));
  const passes = 1 + (mods.extraPass ?? 0);
  if (run.bph) run.bph.turtleUntil = run.time + CHAOS_RULES.fleet.passSeconds * passes;
  for (let pass = 0; pass < passes; pass++) {
    const scale = pass === 0 ? 1 : .5;
    for (const enemy of ships) combat.damage(enemy, 300 * scale);
    for (const enemy of targets) {
      combat.damage(enemy, amount * scale);
      combat.knock(enemy, { x: enemy.x - 1, y: enemy.y }, CHAOS_RULES.fleet.pushPixels);
    }
    effects.push({ kind: "skill", x: WIDTH - 24, y: lane, fromX: 24, fromY: lane,
      value: CHAOS_RULES.fleet.manualWidth / 2, squad: squad.id, label: "거북선 돌진", shape: "lane", index: pass });
  }
}
