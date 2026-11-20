import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { createBphRun } from "../src/bph-session";
import { bphArms } from "../src/bph-combat";
import { bphConsumers, bphFxContext, bindBphConsumers, dispatchBphEffects } from "../src/bph-fx-dispatch";
import { BPH_PROFILES } from "../src/bph-data";
import { advance, soldier } from "../src/rules";
import type { Enemy, Run, SoldierKind, Unit } from "../src/rules";
import { setFieldSize } from "../src/geometry";

/** Fixed seed, stationary foe and ordinary production combat; no range overrides. */
export function spearRangeFixture(profileId = "Hero1_Squire", existing?: Run) {
  setFieldSize(370, 800);
  const meta = freshMeta();
  meta.bph = freshBphSave(7);
  const run = existing ?? createBphRun(meta, { seed: 7, general: "권율", upgrades: [], startBattle: false });
  run.rng = 7;
  const context = bphFxContext(run);
  if (!context || !run.bph) throw new Error("Missing combat context");
  bindBphConsumers(context, bphConsumers(), false);
  dispatchBphEffects(run, { kind: "run-start" });
  const squad = run.squads[0];
  squad.hp = squad.maxHp = 1e9;
  squad.clock = squad.skillClock = 1e9;
  squad.specialAttack = { clock: 1e9, strikeAt: 0, aim: 0 };
  const profile = BPH_PROFILES[profileId];
  const kind = profile.classId === "joseon_cavalry" ? "ming_cavalry"
    : profile.classId === "militia" ? "spearman" : profile.classId as SoldierKind;
  const unit: Unit = { ...soldier(kind, 1, { x: 100, y: 260 }), id: run.nextId++,
    hp: 1e9, maxHp: 1e9, emerging: false,
    bph: { profileId, birthProfileId: profileId, packId: "Pack1_Basic", foil: false, giant: false,
      kills: 0, stage: 0, resultId: null, parentId: null, lifeId: 1, cause: "pack" } };
  squad.soldiers = [unit];
  const enemy: Enemy = { ...run.enemies[0], id: run.nextId++, kind: "yari",
    x: 300, y: 260, hp: 1e9, maxHp: 1e9, speed: 0, elite: false, boss: false,
    wave: false, ladder: false, breach: undefined, goalX: 300, goalY: 260,
    clock: 1e9, strikeAt: 0, prey: null, stun: 0, burn: 0, burnClock: 0, skillClock: 1e9,
    casting: 0, casts: 0, bphProfileId: undefined, shielded: false,
    cargo: undefined, shipArt: undefined, bossArt: undefined, pattern: undefined };
  run.enemies = [enemy];
  run.shots = [];
  run.riftClock = 1e9;
  if (run.bph.survival) run.bph.survival.cursor = Number.MAX_SAFE_INTEGER;
  const reach = bphArms(unit, run)!.reach;
  const step = (seconds = .05) => advance(run, seconds);
  const snapshot = () => ({ seed: 7, profileId, time: run.time, reach,
    unit: { x: unit.x, y: unit.y, clock: unit.clock, strikeAt: unit.strikeAt, aim: unit.aim, quarry: unit.quarry },
    enemy: { x: enemy.x, y: enemy.y, hp: enemy.hp },
    gap: Math.hypot(unit.x - enemy.x, unit.y - enemy.y), shots: run.shots.length });
  return { run, unit, enemy, reach, step, snapshot };
}
