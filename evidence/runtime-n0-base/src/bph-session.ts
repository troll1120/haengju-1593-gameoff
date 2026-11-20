import type { Meta } from "./meta";
import { bonusesOf } from "./meta";
import type { BphEffect, BphSave } from "./bph-contract";
import { BPH_GENERALS, unlockBphGeneral } from "./bph-commanders";
import type { BphGeneral } from "./bph-commanders";
import { addBphProfile, bphUnitInfo, createBphBattle, BPH_SCALE } from "./bph-combat";
import { freshBphSave, grantBphReachabilityFoil } from "./bph-save";
import { bphEffectCombat, createRun, GENERALS } from "./rules";
import type { Run } from "./rules";
import { bphEffectValue } from "./bph";
import type { BphWaveId } from "./bph-waves";
import { bindBphConsumers } from "./bph-fx-dispatch";
import { grantBphMastery, grantBphPacks } from "./bph-account";
import { hasBphShopEffects } from "./bph-shop-session";
import { activateBphQuests } from "./bph-upgrades";

export function ensureBphSave(meta: Meta): BphSave {
  if (meta.bph) return meta.bph;
  const save = freshBphSave();
  save.resources.mastery = meta.merit;
  if (meta.runs > 0) save.unlockedGenerals = BPH_GENERALS.filter(name =>
    name === "권율" || GENERALS.slice(0, meta.unlocked).some(old => old === name));
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
  const run = createRun(entry.seed, entry.general, { ...old, wallHp: old.wallHp * castle * 1.6,
    startTroops: 0, startArrow: 0, startHwacha: 0, navalStart: 0, startLegends: [] }, [entry.general]);
  const chapters: readonly BphWaveId[] = ["WaveChapter1", "WaveChapter2", "WaveChapter3", "WaveChapter4"];
  run.bph = createBphBattle(save, entry.upgrades, chapters[Math.min(save.chapter, chapters.length - 1)]);
  for (const squad of run.squads) {
    squad.maxHp *= BPH_SCALE.generalHp;
    squad.hp *= BPH_SCALE.generalHp;
  }
  run.squads[0].soldiers = []; run.enemies = []; run.shots = [];
  // Bonfire's original 4 HP uses the same damage unit as imported monsters.
  // The owner's four additional walls retain their existing separate HP.
  run.base = run.maxBase = 4 * old.wallHp * castle;
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
        battle.packs.push({ ...pack, hp: 2, x: run.squads[0].x, y: run.squads[0].y });
      }
    },
  }, undefined, entry.startBattle ?? true);
  return run;
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
  grantBphMastery(battle.save, { receiptId: `combat:${meta.runs}`, amount: battle.pendingMastery, source: "combat" });
  battle.save.coins = 0;
  battle.save.lifecycle.managementVisit++;
  // The old account's balances are retained, but new mastery is credited only once.
  meta.version = 4;
  return unlockBphGeneral(battle.save, bphMilestones(meta));
}
