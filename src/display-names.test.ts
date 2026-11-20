import { afterEach, expect, test } from "bun:test";
import { setLanguage, t, tr } from "./i18n";
import { AWAKENINGS, GENERALS, SKILL_NAMES } from "./roster";
import { cardText, createRun, SOLDIER_NAMES } from "./rules";
import { BPH_PROFILES, BPH_TOMES, BPH_PACKS } from "./bph-data";
import { BPH_PACK_NAMES, buyBphOffer } from "./bph-shop";
import type { BphShop } from "./bph-shop";
import { freshBphSave } from "./bph-save";
import { BPH_UPGRADE_NODES, loadBphUpgradeData } from "./bph-upgrade-data";
import { upgradeName, upgradeDescription } from "./bph-upgrade-presentation";

afterEach(() => setLanguage("ko"));

for (const lang of ["ko", "en"] as const) {
  test(`${lang}: rendered skill and awakening names use the approved fortress names`, () => {
    setLanguage(lang);
    for (const [general, expected] of [
      ["이정헌", lang === "ko" ? "행주 화시" : "Haengju Fire Arrows"],
      ["정발", lang === "ko" ? "산성 돌격" : "Fortress Charge"],
    ] as const) {
      expect(t(SKILL_NAMES[general])).toBe(expected);
      const run = createRun(7, general);
      for (const awakened of [0, 1]) {
        run.squads[0].awakened = awakened;
        expect(t(AWAKENINGS[general][awakened].name)).toBe(expected);
        expect(cardText(run, `awaken-${general}`).name).toBe(general);
      }
    }
    const names = [
      ...GENERALS, ...Object.values(SKILL_NAMES), ...Object.values(SOLDIER_NAMES),
      ...Object.values(AWAKENINGS).flatMap(entries => entries.map(entry => entry.name)),
      ...Object.values(BPH_PROFILES).map(profile => profile.name),
      ...Object.values(BPH_TOMES).map(tome => tome.name),
    ].map(t);
    expect(names.filter(name => /Busan|부산/i.test(name))).toEqual([]);
  });

  test(`${lang}: survival display consumers retain no superseded tactics wording`, async () => {
    await loadBphUpgradeData();
    setLanguage(lang);
    expect(t(BPH_PACK_NAMES.Pack3_Magic)).toBe(lang === "ko" ? "전술 병력 모집" : "Tactics Recruit");
    expect(t(BPH_PACK_NAMES.Pack_Tomes)).toBe(lang === "ko" ? "전술 모집" : "Tactics Recruit");
    const output = [
      ...Object.values(BPH_PACK_NAMES).map(t),
      ...Object.values(BPH_TOMES).map(tome => t(tome.name)),
      ...Object.values(BPH_UPGRADE_NODES).flatMap(node => [upgradeName(node), upgradeDescription(node)]),
      tr`${"책략"} ${3}회`,
    ];
    expect(output.filter(text => text.includes("책략"))).toEqual([]);
  });

  test(`${lang}: tactics recruit preserves pack identity, price and single purchase behavior`, () => {
    setLanguage(lang);
    const save = freshBphSave(7);
    const pack = BPH_PACKS.Pack3_Magic;
    save.coins = pack.price + 10;
    const shop: BphShop = { managementVisit: save.lifecycle.managementVisit,
      offers: [{ packId: pack.id, box: false, sold: false, price: pack.price, discounted: false }],
      purchases: {}, rerolls: 0, discountMisses: 0 };
    expect(buyBphOffer(save, shop, 0)).toBe(true);
    expect(save.coins).toBe(10);
    expect(save.inventory.at(-1)?.packId).toBe("Pack3_Magic");
    expect(shop.purchases["Pack3_Magic:false"]).toBe(1);
    expect(buyBphOffer(save, shop, 0)).toBe(false);
    expect(save.coins).toBe(10);
  });
}
