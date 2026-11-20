import { bphStats } from "./bph-combat";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import type { BphActor, BphFxContext, BphFxEvent } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { fireMartialArrow } from "./bph-native-projectiles";
import { martialActor, martialOwner, martialUnits } from "./bph-native-martial-common";
import type { Unit } from "./rules";

/** Augments the existing dash; call before tickDash moves or completes it. */
export function tickDinoRiderArrows(ctx: BphFxContext, actor: BphActor, unit: Unit): void {
  if (actor.kind !== "dash" || ctx.profileId(unit) !== "Hero5_DinoRider"
    || unit.hp <= 0 || actor.data.lifeId !== ctx.unitInfo(unit)?.lifeId) return;
  const raw = BPH_PROFILES.Hero5_DinoRider.raw;
  const interval = Number(raw.riderArrowInterval);
  // Parent repeat dashes shift startedAt after creating their initial arrowAt.
  actor.data.arrowAt = Math.max(actor.data.arrowAt ?? 0, actor.startedAt + interval);
  const through = Math.min(ctx.run.time, actor.until);
  while (actor.data.arrowAt <= through + 1e-7) {
    const at = actor.data.arrowAt;
    actor.data.arrowAt += interval;
    const target = ctx.run.enemies.filter(enemy => enemy.hp > 0)
      .sort((a, b) => Math.hypot(a.x - actor.x, a.y - actor.y) - Math.hypot(b.x - actor.x, b.y - actor.y))[0];
    if (!target) continue;
    const t = Math.min(1, (at - actor.startedAt) / (actor.until - actor.startedAt));
    const x = actor.data.fromX + (actor.toX - actor.data.fromX) * t;
    const y = actor.data.fromY + (actor.toY - actor.data.fromY) * t;
    for (let n = 0; n < Number(raw.riderArrowCount); n++) {
      const arrow = fireMartialArrow(ctx, { unit, target, amount: bphStats(unit, ctx.run)?.damage ?? 0,
        critical: false, extraProjectiles: 0, bounces: 0, attackId: actor.attackId, origin: { x, y } },
      Math.atan2(target.y - y, target.x - x));
      arrow.startedAt = at;
    }
  }
}

/** Authored references resolve to sharedassets1.assets:2667 and :2669. */
export function martialDismount(ctx: BphFxContext, event: BphFxEvent): void {
  const unit = event.kind === "unit-death" ? event.unit : event.kind === "unit-sacrificed"
    ? martialUnits(ctx).find(candidate => candidate.id === event.life.unitId
      && ctx.unitInfo(candidate)?.lifeId === event.life.lifeId) : undefined;
  if (!unit || ctx.profileId(unit) !== "Hero5_DinoRider") return;
  const info = ctx.unitInfo(unit);
  if (!info) return;
  const key = `martial:dismount:${unit.id}:${info.lifeId}`;
  if (ctx.state.counters[key]) return;
  ctx.state.counters[key] = 1;
  const raw = BPH_PROFILES.Hero5_DinoRider.raw;
  const aim = ctx.run.enemies.find(enemy => enemy.id === unit.aim);
  const angle = aim ? Math.atan2(unit.y - aim.y, unit.x - aim.x) : -Math.PI / 2;
  const distance = Number(raw.dismountLeapDistance) * BPH_WORLD_TO_PX / 2;
  for (const id of ["Hero5_Dino", "Hero5_Rider"]) {
    const previous = new Set(martialUnits(ctx));
    ctx.spawnProfile(id, 1, { packId: info.packId, parentId: unit.id, cause: "summon",
      foil: info.foil, giant: info.giant, ...(info.resultId === null ? {} : { resultId: info.resultId }),
      position: { x: unit.x, y: unit.y } });
    for (const child of martialUnits(ctx).filter(candidate => !previous.has(candidate))) {
      const childInfo = ctx.unitInfo(child);
      if (!childInfo) continue;
      ctx.state.counters[`martial:parent-life:${child.id}:${childInfo.lifeId}`] = info.lifeId;
      // Inferred split direction and 0.2s flight; authored total separation=.8.
      const actor = martialActor(ctx, { unit, target: child, amount: 0, critical: false,
        extraProjectiles: 0, bounces: 0 }, "Hero5_DinoRider");
      actor.kind = "dash"; actor.ownerId = child.id;
      actor.toX = unit.x + Math.cos(angle) * distance * (id === "Hero5_Rider" ? 1 : -1);
      actor.toY = unit.y + Math.sin(angle) * distance * (id === "Hero5_Rider" ? 1 : -1);
      actor.until = ctx.run.time + Number(raw.dismountStunSeconds);
      Object.assign(actor.data, { martialDismount: 1, lifeId: childInfo.lifeId,
        sourceLifeId: info.lifeId, elevation: 0, landAt: ctx.run.time + 0.2 });
      child.strikeAt = Infinity; child.clock = Number(raw.dismountStunSeconds); child.emerging = false;
      ctx.applyBuff({ target: child, source: unit, side: "ally", id: "Stun",
        duration: Number(raw.dismountStunSeconds), power: 0, stacks: 1 });
    }
  }
}

export function tickMartialDismounts(ctx: BphFxContext): void {
  const done = new Set<number>();
  for (const actor of ctx.state.actors) {
    if (actor.data.martialDismount !== 1) continue;
    const child = martialOwner(ctx, actor);
    if (!child) { done.add(actor.id); continue; }
    const t = Math.min(1, Math.max(0, (ctx.run.time - actor.startedAt) / (actor.data.landAt - actor.startedAt)));
    child.x = actor.x = actor.data.fromX + (actor.toX - actor.data.fromX) * t;
    child.y = actor.y = actor.data.fromY + (actor.toY - actor.data.fromY) * t;
    actor.data.elevation = 0.2 * BPH_WORLD_TO_PX * 4 * t * (1 - t);
    if (ctx.run.time >= actor.until) { child.strikeAt = 0; child.clock = 0; done.add(actor.id); }
  }
  ctx.state.actors = ctx.state.actors.filter(actor => !done.has(actor.id));
}
