import type { Meta } from "./meta";
import { bonusesOf } from "./meta";
import type { BphEffect, BphSave } from "./bph-contract";
import { unlockBphGeneral } from "./bph-commanders";
import type { BphGeneral } from "./bph-commanders";
import { addBphProfile, bphCratePoint, bphUnitInfo, createBphBattle, BPH_SCALE } from "./bph-combat";
import { freshBphSave, grantBphReachabilityFoil } from "./bph-save";
import { bphEffectCombat, createRun } from "./rules";
import type { Run } from "./rules";
import { bphEffectValue } from "./bph";
import { bindBphConsumers } from "./bph-fx-dispatch";
import { grantBphMastery, grantBphPacks } from "./bph-account";
import { hasBphShopEffects } from "./bph-shop-session";
import { activateBphQuests } from "./bph-upgrades";
import { BPH_SURVIVAL_CHAPTERS, BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { startBphPalisade } from "./bph-smithy";
import { bphGeneralMastery } from "./bph-mastery-sides";
import { bphScaledMedals } from "./bph-medal-scale";

export function ensureBphSave(meta: Meta): BphSave {
  if (meta.bph) return meta.bph;
  const save = freshBphSave();
  save.resources.mastery = meta.merit;
  // The legacy unlocked counter included free starter slots, not cleared objectives.
  // Leave milestone backfill to the same quest check used by existing BPH saves.
  meta.bph = save; meta.version = 4;
  return save;
}
export function bphMilestones(meta: Meta) {
  return { runs: meta.runs, bestSeconds: meta.bestSeconds,
    bossesReached: meta.bossesReached ?? 0, bossesKilled: meta.bossesKilled ?? 0 };
}
export function createBphRun(meta: Meta, entry: {
  readonly seed: number; readonly general: BphGeneral; readonly upgrades: readonly BphEffect[];
  readonly startBattle?: boolean;
  readonly endless?: boolean;
}): Run {
  const save = ensureBphSave(meta);
  activateBphQuests(save);
  const old = bonusesOf(meta), castle = 1 + bphEffectValue(entry.upgrades, "BonfireMaxHP");
  // The general side's cooldown cut is a faster skill charge: a 30% shorter wait is a charge rate of 1 / 0.7.
  const cut = bphGeneralMastery(entry.upgrades).cooldownCut;
  const run = createRun(entry.seed, entry.general, { ...old, wallHp: old.wallHp * castle,
    ...(save.generalUpgrades ? { generalUpgrades: structuredClone(save.generalUpgrades) } : {}),
    ...cut ? { skillCharge: old.skillCharge / (1 - cut) } : {},
    startTroops: 0, startArrow: 0, startHwacha: 0, navalStart: 0, startLegends: [] }, [entry.general]);
  run.bph = createBphBattle(save, entry.upgrades,
    BPH_SURVIVAL_CHAPTERS[Math.min(save.chapter, BPH_SURVIVAL_CHAPTERS.length - 1)], entry.seed);
  for (const squad of run.squads) {
    squad.maxHp *= BPH_SCALE.generalHp;
    squad.hp *= BPH_SCALE.generalHp;
  }
  run.squads[0].soldiers = []; run.enemies = []; run.shots = [];
  startBphPalisade(run, old.wallHp * castle * (old.wallStart ?? 1));
  // Walls show early siege attrition; the keep provides a second defensive
  // phase instead of ending the run on one hit through the first breach.
  run.base = run.maxBase = BPH_SURVIVAL_TABLE.keepHp * old.wallHp * castle;
  run.gold = !entry.endless && hasBphShopEffects(entry.upgrades) && save.shop?.managementVisit === save.lifecycle.managementVisit
    ? save.coins : Math.min(12, save.income);
  save.coins = run.gold;
  run.earned = 0; run.nextXp = Infinity;
  const battle = run.bph;
  bindBphConsumers({ run, save, effects: entry.upgrades, state: battle.fx,
    pointer: { x: run.squads[0].x, y: run.squads[0].y },
    ...bphEffectCombat(run, battle.fxEvents),
    profileId: unit => bphUnitInfo(unit)?.profileId ?? null,
    unitInfo: bphUnitInfo,
    spawnProfile: (profileId, copies, origin) => addBphProfile(run, { profileId, copies, foil: origin?.foil ?? false,
      ...(origin?.giant ? { giant: true } : {}), discovered: false },
      origin ?? { packId: "DeliveryBox", cause: "effect" }),
    grantPack: (packId, count, metadata) => {
      for (const pack of grantBphPacks(save, { packId, count, metadata })) {
        battle.packs.push({ ...pack, hp: 2, ...bphCratePoint(pack.id), landAt: run.time });
      }
    },
  }, undefined, entry.startBattle ?? true);
  return run;
}
export function bphBattleMedals(run: Run): number {
  const battle = run.bph;
  if (!battle) return 0;
  // Each dropped medal settles whole. Other sources of combat merit still use their conversion cap.
  return battle.survival ? (battle.killMedals ?? 0) + Math.min(BPH_SURVIVAL_TABLE.meritCap, bphScaledMedals(battle.pendingMastery)) : battle.pendingMastery;
}

export function settleBphRun(meta: Meta, run: Run): readonly BphGeneral[] {
  const battle = run.bph;
  if (!battle || battle.settled || (run.phase !== "won" && run.phase !== "lost")) return [];
  battle.settled = true;
  meta.runs++; meta.bestSeconds = Math.max(meta.bestSeconds, run.time);
  meta.bossesReached = (meta.bossesReached ?? 0) + run.metrics.bosses.length;
  meta.bossesKilled = (meta.bossesKilled ?? 0) + run.metrics.bosses.filter(boss => boss.fallen !== null).length;
  if (run.phase === "won") {
    meta.wins++; battle.save.chapter++;
    if (battle.waveId === "WaveChapter3" && run.time >= 600) grantBphReachabilityFoil(battle.save);
  } else meta.losses++;
  grantBphMastery(battle.save, { receiptId: `combat:${meta.runs}`, amount: bphBattleMedals(run), source: "combat" });
  battle.save.coins = 0;
  battle.save.lifecycle.managementVisit++;
  // The old account's balances are retained, but new mastery is credited only once.
  meta.version = 4;
  return unlockBphGeneral(battle.save, bphMilestones(meta));
}
/** An endless run ends on castle fall and keeps only personal bests, one per measure. */
export function recordEndlessBest(meta: Meta, run: Run): { readonly seconds: number; readonly kills: number; readonly improved: boolean } {
  const previous = meta.endlessBest ?? { seconds: 0, kills: 0 }, seconds = Math.floor(run.time);
  meta.endlessBest = { seconds: Math.max(previous.seconds, seconds), kills: Math.max(previous.kills, run.kills) };
  return { ...meta.endlessBest, improved: seconds > previous.seconds || run.kills > previous.kills };
}
