import { expect, test } from "bun:test";
import { equipBphRelic, grantBphRelic } from "./bph-account";
import { bphStats, bphUnitInfo } from "./bph-combat";
import { BPH_GENERALS } from "./bph-commanders";
import { bphFxContext } from "./bph-fx-dispatch";
import { freshBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { buyBphSmithyClass } from "./bph-smithy";
import { activeBphEffects } from "./bph-upgrades";
import { freshMeta } from "./meta";

test.each(BPH_GENERALS)("%s leads a survival run while the equipped trumpet duplicates only recruited spearmen", general => {
  const meta = freshMeta(), save = freshBphSave(1593);
  meta.bph = save;
  grantBphRelic(save, "Relic1_CharmWarrior");
  for (const worn of [false, true]) {
    if (worn) equipBphRelic(save, "Relic1_CharmWarrior");
    const run = createBphRun(meta, { seed: 1593, general, upgrades: activeBphEffects(save) });
    const [commander] = run.squads;
    expect(commander.general).toBe(general);
    expect(bphUnitInfo(commander)).toBeNull();
    expect(bphStats(commander, run)).toBeNull();
    expect(commander.soldiers).toHaveLength(0);
    const context = bphFxContext(run);
    if (!context) throw new Error("Missing survival battle context");
    context.spawnProfile("Hero1_Squire", 1, { packId: "Pack1_Basic", cause: "pack" });
    expect(commander.soldiers.map(unit => unit.bph?.profileId))
      .toEqual(Array(worn ? 2 : 1).fill("Hero1_Squire"));
    expect(run.squads.map(squad => squad.general)).toEqual([general]);
  }
});

test.each([
  ["Relic_HuntersAreOutcast", "archer", "militia", "Hero1_Barbarian", "Pack1_Basic"],
  ["Relic_ArcanistsAreHunters", "monk", "archer", "Hero1_Archer", "Pack1_Basic"],
  ["Relic_MilitiaAreMystics", "spearman", "monk", "Hero2_Monk", "Pack2_Advanced"],
  ["Relic_MysticsAreArcanists", "monk", "hwacha", "Hero2_Pyromancer", "Pack2_Advanced"],
  ["Relic_OutcastsAreMilitia", "militia", "spearman", "Hero1_Squire", "Pack1_Basic"],
] as const)("%s shares a smithy purchase with just one relic slot", (id, improved, ally, profile, packId) => {
  for (const worn of [false, true]) {
    const meta = freshMeta(), save = freshBphSave(1593);
    meta.bph = save;
    grantBphRelic(save, id);
    if (worn) expect(equipBphRelic(save, id)).toBe(true);
    const run = createBphRun(meta, { seed: 1593, general: "권율", upgrades: activeBphEffects(save) });
    const ctx = bphFxContext(run);
    if (!ctx) throw new Error("Missing survival battle context");
    ctx.spawnProfile(profile, 1, { packId, cause: "pack" });
    const [unit] = run.squads[0].soldiers;
    const before = bphStats(unit, run)!;
    run.gold = 20;
    expect(buyBphSmithyClass(run, improved)).toBe(true);
    expect(bphStats(unit, run)?.damage).toBeCloseTo(before.damage * (worn ? 1.2 : 1));
    expect(bphStats(unit, run)?.hp).toBeCloseTo(before.hp * (worn ? 1.2 : 1));
    expect(buyBphSmithyClass(run, ally)).toBe(true);
    expect(bphStats(unit, run)?.damage).toBeCloseTo(before.damage * 1.2);
  }
});
