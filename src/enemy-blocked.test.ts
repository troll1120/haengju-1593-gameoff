import { afterEach, expect, test } from "bun:test";
import { addBphProfile } from "./bph-combat";
import { createBphRun } from "./bph-session";
import { distance, HEIGHT, setFieldSize, WIDTH } from "./geometry";
import { freshMeta } from "./meta";
import { advance, type Enemy, type Run } from "./rules";

const field = { width: WIDTH, height: HEIGHT };
afterEach(() => setFieldSize(field.width, field.height));

const FPS = 30;
const preyOf = (run: Run, enemy: Enemy) => {
  const squad = enemy.prey && run.squads.find(each => each.id === enemy.prey![0]);
  return squad && (enemy.prey![1] < 0 ? squad : squad.soldiers[enemy.prey![1]]);
};

/** Owner DM 1795149685.021769: with 신립 on seed 144, spearmen packed onto one soldier south of the fort at about
 *  83 s and 99 s; the ones behind were bodily blocked by the ones in front and struck nothing for 2 s or more. */
test("an enemy blocked from its chosen ally strikes something else instead of waiting", () => {
  setFieldSize(390, 844);
  const run = createBphRun(freshMeta(), { seed: 144, general: "신립", upgrades: [] });
  for (const profileId of ["Hero1_Squire", "Hero1_Barbarian", "Hero1_Squire", "Hero1_Barbarian"])
    addBphProfile(run, { profileId, copies: 8, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  // The scene under test is the crowd south of the fort, not the keep: hold the keep so the run reaches 102 s.
  const step = () => { run.base = run.maxBase; return advance(run, 1 / FPS); };
  const frames = (until: number) => Math.ceil((until - run.time) * FPS) + FPS;
  for (let i = frames(76); i > 0 && run.time < 76; i--) step();
  expect(run.time).toBeGreaterThanOrEqual(76);
  const since = new Map<number, { at: number; gap: number; prey: string; x: number; y: number }>();
  let longest = 0;
  for (let i = frames(102); i > 0 && run.time < 102; i--) {
    const struck = new Set(step().filter(effect => effect.kind === "lunge").map(effect => effect.target));
    for (const enemy of run.enemies) {
      const prey = enemy.hp > 0 && enemy.clock <= 0 && !struck.has(enemy.id) ? preyOf(run, enemy) : undefined;
      const mark = since.get(enemy.id);
      if (!prey) { since.delete(enemy.id); continue; }
      const gap = distance(enemy, prey), key = enemy.prey!.join(":");
      if (!mark || mark.prey !== key || gap < mark.gap - 5 || distance(mark, prey) >= 4)
        since.set(enemy.id, { at: run.time, gap, prey: key, x: prey.x, y: prey.y });
      else longest = Math.max(longest, run.time - mark.at);
    }
  }
  expect(run.time).toBeGreaterThanOrEqual(102);
  expect(longest).toBeLessThan(1.5);
}, 120_000);
