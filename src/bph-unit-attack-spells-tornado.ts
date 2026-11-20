import type { BphActor, BphFxContext } from "./bph-contract";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { HEIGHT, WIDTH } from "./geometry";
import { moveEnemy } from "./enemy-wall";
import { unitSpellHit } from "./bph-unit-attack-spells";

// TornadoSpell, sharedassets1.assets:3528. Positions are battlefield pixels.
const PULL = 0.4000000059604645 * BPH_WORLD_TO_PX;
const SWIRL = 0.20000000298023224 * BPH_WORLD_TO_PX;
const SOFT_RADIUS = 0.4000000059604645 * BPH_WORLD_TO_PX;
const SPEED = 0.6000000238418579 * BPH_WORLD_TO_PX;
const WANDER = 2.5 * BPH_WORLD_TO_PX;
const JITTER = 0.11999999731779099 * BPH_WORLD_TO_PX;
const RETARGET_MIN = 0.4000000059604645;
const RETARGET_MAX = 1.2000000476837158;
const STEP = 1 / 60;

/** Fixed simulation cadence prevents caller frame size from changing wander RNG. */
export function tickUnitTornado(ctx: BphFxContext, actor: BphActor, dt: number): boolean {
  const data = actor.data;
  data.age = Math.min(data.duration, data.age + dt);
  while (data.simulated + STEP <= data.age + 1e-10 ||
    (data.age >= data.duration && data.simulated < data.duration - 1e-10)) {
    const step = Math.min(STEP, data.duration - data.simulated);
    if (data.simulated + 1e-10 >= data.retargetAt) {
      const angle = ctx.random() * Math.PI * 2, radius = Math.sqrt(ctx.random()) * WANDER;
      actor.toX = Math.max(0, Math.min(WIDTH, data.anchorX + Math.cos(angle) * radius));
      actor.toY = Math.max(0, Math.min(HEIGHT, data.anchorY + Math.sin(angle) * radius));
      data.retargetAt = data.simulated + RETARGET_MIN + ctx.random() * (RETARGET_MAX - RETARGET_MIN);
    }
    const jitter = Math.sin(data.simulated * Math.PI * 2) * JITTER;
    const dx = actor.toX + jitter - actor.x, dy = actor.toY - actor.y;
    const length = Math.hypot(dx, dy);
    const travel = Math.min(length, SPEED * step);
    if (length) {
      actor.x = Math.max(0, Math.min(WIDTH, actor.x + dx / length * travel));
      actor.y = Math.max(0, Math.min(HEIGHT, actor.y + dy / length * travel));
    }
    // spinDegreesPerSecond=0; swirl is tangential world units/second, not spin degrees.
    for (const enemy of ctx.run.enemies) {
      if (enemy.hp <= 0) continue;
      const ex = enemy.x - actor.x, ey = enemy.y - actor.y, distance = Math.hypot(ex, ey);
      if (distance > Math.max(actor.radius, SOFT_RADIUS)) continue;
      if (!actor.targets.includes(enemy.id)) actor.targets.push(enemy.id);
      const nx = distance ? ex / distance : 1, ny = distance ? ey / distance : 0;
      const pull = Math.min(distance, PULL * Math.min(1, distance / SOFT_RADIUS) * step);
      moveEnemy(ctx.run, enemy, { x: Math.max(0, Math.min(WIDTH, enemy.x - nx * pull - ny * SWIRL * step)),
        y: Math.max(0, Math.min(HEIGHT, enemy.y - ny * pull + nx * SWIRL * step)) });
    }
    data.simulated += step;
    const ticks = Math.floor((data.simulated + 1e-10) / data.tick);
    while (data.ticks < ticks) {
      data.ticks++;
      for (const enemy of ctx.run.enemies) {
        if (enemy.hp > 0 && Math.hypot(enemy.x - actor.x, enemy.y - actor.y) <= actor.radius + 1e-9)
          unitSpellHit(ctx, actor, enemy);
      }
    }
  }
  if (data.age < data.duration) return false;
  for (const enemy of ctx.run.enemies) {
    if (enemy.hp <= 0 || enemy.boss || !actor.targets.includes(enemy.id)) continue;
    const dx = enemy.x - actor.x, dy = enemy.y - actor.y, distance = Math.hypot(dx, dy);
    // Native enemies have no velocity slot: integrate the original 3-unit/s impulse
    // for one fixed simulation step rather than inventing a persistent status.
    const kick = 3 * BPH_WORLD_TO_PX * STEP;
    moveEnemy(ctx.run, enemy, { x: Math.max(0, Math.min(WIDTH, enemy.x + (distance ? dx / distance : 1) * kick)),
      y: Math.max(0, Math.min(HEIGHT, enemy.y + (distance ? dy / distance : 0) * kick)) });
  }
  return true;
}
