import { expect, test } from "bun:test";
import { freshMeta } from "./meta";
import { createBphRun, settleBphRun } from "./bph-session";
import { addBphProfile, bphStats, hitBphPack } from "./bph-combat";
import { ensureBphSave } from "./bph-session";
import { buyBphOffer, createBphShop } from "./bph-shop";
import { bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { freshBphSave, parseBphSave } from "./bph-save";
import { bphCodexDetails, bphCodexIdentities, bphCodexLabel } from "./bph-codex-details";
import { BPH_PROFILES } from "./bph-data";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { BPH_CODEX_SLOTS } from "./bph-codex-data";
import { discoverBphCodex, reconcileBphCodexRewards, BPH_CODEX_CLASS_REWARDS, BPH_CODEX_DISCOVERY_GOLD } from "./bph-codex-rewards";
import { bphCodexCards } from "./bph-codex";
import { advance } from "./rules";
import { claimBphRelic } from "./bph-account";

test("actual spawn and encountered living enemy survive the account save boundary", () => {
  const meta = freshMeta();
  const run = createBphRun(meta, { seed: 1593, general: "권율", upgrades: [] });
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic" });
  for (let i = 0; i < 200 && !run.enemies.some(e => e.bphProfileId); i++) advance(run, .05);
  const encountered = run.enemies.find(e => e.bphProfileId)?.bphProfileId;
  expect(encountered).toBeDefined();
  expect(meta.bph?.discovered).toContain(encountered);
  expect(meta.bph?.discovered).toContain("Hero1_Squire");
  expect(meta.bph?.discovered).toContain("general:권율");
  const restored = parseBphSave(JSON.parse(JSON.stringify(meta.bph)));
  expect(restored.discovered).toEqual(meta.bph?.discovered ?? []);
  const coins = run.gold;
  const next = createBphRun({ ...meta, bph: restored }, { seed: 1593, general: "권율", upgrades: [] });
  expect(next.gold).toBe(3);
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic" });
  expect(run.gold).toBe(coins);
});

test("legacy discoveries receive new rewards once and hidden-B migration survives reload", () => {
  const legacy = freshBphSave();
  legacy.discovered = ["Hero1_Squire", "Hero1_Squire", "Monster1_Caveling"];
  legacy.purchasedNodes = ["SN_DinoRiderMerge"];
  const once = parseBphSave(legacy);
  expect(once.codexRewards?.pendingGold).toBe(2);
  expect(once.discovered).toEqual(["Hero1_Squire", "Monster1_Caveling"]);
  expect(once.purchasedNodes).not.toContain("SN_DinoRiderMerge");
  const twice = parseBphSave(JSON.parse(JSON.stringify(once)));
  expect(twice.codexRewards).toEqual(once.codexRewards);
  expect(twice.hiddenUpgradeRefund).toEqual(once.hiddenUpgradeRefund);
});

test("a repeated known encounter does not overwrite unrelated saved coins", () => {
  const meta = freshMeta();
  const run = createBphRun(meta, { seed: 1593, general: "권율", upgrades: [] });
  const save = ensureBphSave(meta);
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic" });
  const paid = run.gold;
  save.coins += 4;
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic" });
  expect(run.gold).toBe(paid);
  expect(save.coins).toBe(paid + 4);
  expect(save.codexRewards?.claimed.filter(id => id === "discovery:Hero1_Squire")).toHaveLength(1);
});

test("the basic spearman stays a question mark until its first real recruit, which pays once, and an old find is never paid again", () => {
  const meta = freshMeta();
  const run = createBphRun(meta, { seed: 1593, general: "권율", upgrades: [] });
  const save = ensureBphSave(meta);
  const squire = (account: typeof save) => bphCodexCards(account, "allies", "spearman").find(card => card.key === "Hero1_Squire");
  const recruit = (target: typeof run) => addBphProfile(target,
    { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  expect([save.discovered.includes("Hero1_Squire"), squire(save)?.label]).toEqual([false, "???"]);
  const gold = run.gold;
  recruit(run);
  expect([run.gold, squire(save)?.discovered]).toEqual([gold + BPH_CODEX_DISCOVERY_GOLD, true]);
  recruit(run);
  expect(run.gold).toBe(gold + BPH_CODEX_DISCOVERY_GOLD);
  const old = parseBphSave(JSON.parse(JSON.stringify(save)));
  expect([old.discovered, old.codexRewards]).toEqual([save.discovered, save.codexRewards]);
  const next = createBphRun({ ...meta, bph: old }, { seed: 1593, general: "권율", upgrades: [] });
  const start = next.gold;
  recruit(next);
  expect([next.gold, old.codexRewards?.claimed.filter(id => id === "discovery:Hero1_Squire").length]).toEqual([start, 1]);
});

test("purchased pack opening records the earned unit without repeat reward on respawn", () => {
  const meta = freshMeta(), save = ensureBphSave(meta);
  buyBphOffer(save, createBphShop(save, []), 0);
  const run = createBphRun(meta, { seed: 144, general: "권율", upgrades: [] });
  const pack = run.bph?.packs[0];
  if (!pack) throw new Error("missing purchased pack");
  hitBphPack(run, pack.id);
  const receipt = hitBphPack(run, pack.id)[0];
  const card = receipt.cards[0];
  expect(save.discovered).toContain(card.profileId);
  expect(save.codexRewards?.claimed.filter(id => id === `discovery:${card.profileId}`)).toHaveLength(1);
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  expect(restored.codexRewards).toEqual(save.codexRewards);
});

test("paid discovery gold cannot refill a purse by quitting or settling a run", () => {
  const meta = freshMeta(), save = ensureBphSave(meta);
  save.discovered.push("Hero1_Squire");
  reconcileBphCodexRewards(save);
  expect(save.codexRewards?.pendingGold).toBe(1);
  const first = createBphRun(meta, { seed: 4, general: "권율", upgrades: [] });
  expect(first.gold).toBe(4); // one legacy collection unit
  expect(save.codexRewards?.pendingGold).toBe(0);
  const retry = createBphRun(meta, { seed: 4, general: "권율", upgrades: [] });
  expect(retry.gold).toBe(3);
  retry.gold = 25;
  retry.phase = "lost";
  settleBphRun(meta, retry);
  expect(save.coins).toBe(0);
  expect(createBphRun(meta, { seed: 4, general: "권율", upgrades: [] }).gold).toBe(3);
  expect(createBphRun(meta, { seed: 4, general: "권율", upgrades: [] }).gold).toBe(3);
});

test("class completion offers an existing unequipped item once with no cosmetic combat delta", () => {
  const meta = freshMeta();
  const run = createBphRun(meta, { seed: 3, general: "권율", upgrades: [] });
  const save = run.bph?.save;
  if (!save) throw new Error("missing battle");
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic" });
  const soldier = run.squads[0].soldiers[0];
  const before = bphStats(soldier, run);
  for (const slot of BPH_CODEX_SLOTS) discoverBphCodex(save, slot.id);
  expect(save.relicState.owned).toEqual([]);
  for (const relic of Object.values(BPH_CODEX_CLASS_REWARDS)) {
    expect(claimBphRelic(save, relic)).toBe(true);
    expect(claimBphRelic(save, relic)).toBe(false);
  }
  expect(save.relicState.owned).toContain(BPH_CODEX_CLASS_REWARDS.spearman);
  expect(save.relicState.owned).toHaveLength(8);
  for (const id of save.relicState.owned) {
    expect(BPH_UPGRADE_NODES[id].type).toBe(5);
    expect(BPH_HIDDEN_UPGRADES.has(id)).toBe(false);
  }
  expect(save.relicState.equipped).toEqual([]);
  expect(save.codexRewards?.claimed.filter(id => id.startsWith("frame:") || id.startsWith("title:"))).toEqual([]);
  expect(bphStats(soldier, run)).toEqual(before);
  const again = parseBphSave(JSON.parse(JSON.stringify(save)));
  reconcileBphCodexRewards(again);
  expect(again.relicState.owned).toEqual(save.relicState.owned);
  expect(again.codexRewards).toEqual(save.codexRewards);
});

test("a fresh account completes a class on its obtainable members and never on a vacuous roster", () => {
  // Only Basic is unlocked. A class without an unlocked member still requires its full roster.
  const save = freshBphSave();
  expect(claimBphRelic(save, BPH_CODEX_CLASS_REWARDS.spearman)).toBe(false);
  discoverBphCodex(save, "Hero1_Squire");
  expect(parseBphSave(JSON.parse(JSON.stringify(save))).relicState.discovered).toContain(BPH_CODEX_CLASS_REWARDS.spearman);
  discoverBphCodex(save, "Hero3_Portal");
  expect(save.relicState.discovered).not.toContain(BPH_CODEX_CLASS_REWARDS.panokseon);
  save.packs.Pack3_Magic = { opened: 1, sinceNewHero: 0, sinceNewFoil: 0 };
  reconcileBphCodexRewards(save);
  expect(save.relicState.discovered).toContain(BPH_CODEX_CLASS_REWARDS.panokseon);
  // Pack5 units are unreachable in survival: the chongtong roster cannot complete, let alone vacuously.
  const chongtong = freshBphSave();
  discoverBphCodex(chongtong, "Hero6_Shotgun");
  expect(claimBphRelic(chongtong, BPH_CODEX_CLASS_REWARDS.chongtong)).toBe(false);
});

test("different spear identities remain distinct and promotion follows runtime kill thresholds", () => {
  expect(bphCodexIdentities(["Hero1_Squire", "Hero2_Knight", "Hero1_Squire"]))
    .toEqual(["Hero1_Squire", "Hero2_Knight"]);
  expect(bphCodexLabel("Hero1_Squire")).not.toBe(bphCodexLabel("Hero2_Knight"));
  const details = bphCodexDetails("Hero1_Squire",
    ["SN_SquireUpgrade2", "SN_SquireUpgrade", "SN_SquireUpgrade3"].flatMap(id => BPH_UPGRADE_NODES[id].effects));
  expect(details.evolution.map(e => [e.profileId, e.kills, e.changesIdentity]))
    .toEqual([["Hero1_Squire2", 10, false], ["Hero1_Squire3", 20, false], ["Hero4_Bannerman", 50, true]]);
  expect(details.evolution.every(e => e.unlocked)).toBe(true);
  const run = createBphRun(freshMeta(), { seed: 3, general: "권율", upgrades: [] });
  addBphProfile(run, { profileId: "Hero2_Knight", copies: 1, foil: false, discovered: false },
    { packId: "Pack2_Rare" });
  const stats = bphStats(run.squads[0].soldiers[0], run);
  if (!stats) throw new Error("missing soldier stats");
  expect(bphCodexDetails("Hero2_Knight").stats.find(s => s.label === "공격력")?.value).toBe(stats?.damage);
  expect(bphCodexDetails("Hero2_Knight").stats.find(s => s.label === "공격 간격")?.value).toBe(stats?.cooldown);
  expect(BPH_PROFILES.Hero2_Knight.damage).toBe(stats?.damage);
});

test("numeric skill damage matches the live fireball hit rather than raw unused defaults", () => {
  const run = createBphRun(freshMeta(), { seed: 3, general: "권율", upgrades: [] });
  addBphProfile(run, { profileId: "Hero2_Pyromancer", copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic", position: { x: 100, y: 200 } });
  const unit = run.squads[0].soldiers[0];
  for (let i = 0; i < 200 && !run.enemies.length; i++) advance(run, .05);
  const enemy = run.enemies[0];
  enemy.x = 110; enemy.y = 200; enemy.hp = enemy.maxHp = 100; enemy.shielded = false;
  const context = bphFxContext(run);
  if (!context) throw new Error("missing effects context");
  context.state.spells.length = 0;
  context.state.actors.length = 0;
  unit.x = 100; unit.y = 200;
  dispatchBphEffects(run, { kind: "before-attack", unit, target: enemy,
    attack: { multiplier: 1, extraProjectiles: 0, bounces: 0, handled: false } });
  for (let i = 0; i < 5; i++) {
    run.time += .05;
    dispatchBphEffects(run, { kind: "step", dt: .05 });
  }
  const displayed = bphCodexDetails("Hero2_Pyromancer").skills[0].values.find(v => v.label === "피해")?.value;
  if (displayed === undefined) throw new Error("missing damage detail");
  expect(100 - enemy.hp).toBe(displayed);
  // Native Hero.GetSpellCastBaseDamage: Pyromancer casts her effective attack 3.
  expect(displayed).toBe(3);
});
