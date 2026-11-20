import type Phaser from "phaser";
import { BPH_GENERALS } from "../src/bph-commanders";
import type { BphGeneral } from "../src/bph-commanders";
import { chaosArena, chaosEnemy, chaosTicks } from "../src/chaos-test-fixture";
import { CHAOS_RULES } from "../src/chaos-contract";
import type { PaintedArt } from "../src/painted-art";
import { useSkill } from "../src/rules";
import { SKILL_SHOWS } from "../src/shows";
import { SkillStage } from "../src/skill-stage";
import type { ShowChannels } from "../src/skill-show";

export const DIM_TIERS = [
  { level: 1, awakened: 0 }, { level: 10, awakened: 0 },
  { level: 20, awakened: 0 }, { level: 20, awakened: 2 },
] as const;
export { BPH_GENERALS };
export const FRAME_MS = 1000 / CHAOS_RULES.simulationHz;

/** The real stage and shows with drawing sinks only; no browser, texture decoding or simulation clock replacement. */
export function dimFixture(general: BphGeneral, level: number, awakened = 0,
  channels: ShowChannels = { motion: true, flash: true }) {
  const run = chaosArena(general, level), squad = run.squads[0];
  squad.awakened = awakened; squad.tier = awakened + 1;
  for (const [x, y] of [[195, 210], [130, 260], [260, 290]]) chaosEnemy(run, x, y);
  const pictures: Record<string, unknown>[] = [];
  const picture = () => {
    const state: Record<string, unknown> = { visible: false, alpha: 1, width: 32, height: 32,
      displayWidth: 32, displayHeight: 32, x: 0, y: 0, originY: .5, active: true,
      anims: { isPlaying: false, stop() {} } };
    const proxy = new Proxy(state, { get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        if (key === "setVisible") target.visible = args[0];
        if (key === "setAlpha") target.alpha = args[0];
        if (key === "setPosition") { target.x = args[0]; target.y = args[1]; }
        if (key === "getCenter" || key === "getBottomCenter") return { x: target.x, y: target.y };
        return proxy;
      };
    } });
    pictures.push(state);
    return proxy;
  };
  const scene = { add: { rectangle: picture, graphics: picture, image: picture, sprite: picture, text: picture },
    textures: { exists: () => true } } as unknown as Phaser.Scene;
  const stage = new SkillStage(scene, { draw() {} } as unknown as PaintedArt, SKILL_SHOWS);
  const dusk = pictures[0];
  const cast = () => {
    squad.skillClock = 0;
    const effects = useSkill(run, squad.id);
    for (const skill of effects.filter(effect => effect.kind === "skill")) {
      if (!stage.staged(general, skill)) continue;
      stage.cast(general, { skill, results: [], run, squad, from: squad, tier: squad.tier, channels, density: 1 }, () => undefined);
    }
    return effects;
  };
  const frame = () => {
    stage.update(FRAME_MS, { run, cssPixel: 1, at: unit => unit, foe: () => undefined, channels });
    return dusk.visible ? Number(dusk.alpha) : 0;
  };
  const step = () => { chaosTicks(run, 1); return frame(); };
  return { run, squad, stage, dusk, channels, cast, frame, step };
}

export function measureDim(general: BphGeneral, level: number, awakened: number) {
  const fixture = dimFixture(general, level, awakened);
  fixture.cast();
  const events = fixture.run.chaosSkills!.events.filter(event => event.trigger === "manual");
  if (!events.length) throw new Error(`${general}: no manual show`);
  const endTick = Math.max(...events.map(event => event.untilTick));
  let overlayEnd = 0, gaps = 0;
  const trace: { ms: number; alpha: number; active: number }[] = [];
  for (let tick = 0; tick < endTick + 45; tick++) {
    const alpha = fixture.frame(), ms = (tick + 1) * FRAME_MS;
    const active = fixture.run.chaosSkills!.events.filter(event => event.trigger === "manual").length;
    trace.push({ ms, alpha, active });
    if (alpha > 0) overlayEnd = ms;
    if (tick > 0 && tick < endTick && alpha === 0) gaps++;
    chaosTicks(fixture.run, 1);
  }
  fixture.stage.clear();
  return { general, level, awakened, showEnd: endTick * FRAME_MS, overlayEnd, gaps, trace };
}
