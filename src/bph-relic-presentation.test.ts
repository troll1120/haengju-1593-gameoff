import { expect, test } from "bun:test";
import { grantBphRelic } from "./bph-account";
import { bphRelicArt, bphRelicCards, bphRelicName } from "./bph-relics";
import { freshBphSave } from "./bph-save";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { setLanguage } from "./i18n";

const relics = Object.values(BPH_UPGRADE_NODES).filter(node => node.type === 5);

test("all 45 relics have unique Korean names and distinct existing thematic artwork", async () => {
  setLanguage("ko");
  expect(relics).toHaveLength(45);
  const names = relics.map(relic => bphRelicName(relic.id));
  const artwork = relics.map(relic => bphRelicArt(relic.id));
  expect(new Set(names).size).toBe(45);
  expect(new Set(artwork).size).toBe(45);
  for (const name of names) {
    expect(name).not.toMatch(/유물|미확인|[A-Za-z_]/);
    expect(name.length).toBeGreaterThan(1);
  }
  for (const art of artwork) {
    expect(art).not.toContain("unit-cap-relic");
    expect(await Bun.file(new URL(`../public/${art.slice(2)}`, import.meta.url)).exists()).toBe(true);
  }
  expect(artwork.filter(art => art.startsWith("./art/relics/"))).toHaveLength(9);
});

test("the owned list shows all 45 relics with their individual names and pictures", () => {
  setLanguage("ko");
  const save = freshBphSave();
  for (const relic of relics) grantBphRelic(save, relic.id);
  const cards = bphRelicCards(save);
  expect(cards).toHaveLength(45);
  expect(cards.map(card => card.id)).toEqual(relics.map(relic => relic.id));
  for (const card of cards) {
    expect(card.name).toBe(bphRelicName(card.id));
    expect(card.art).toBe(bphRelicArt(card.id));
  }
  save.relicState.destroyed.push(relics[0].id);
  expect(bphRelicCards(save).map(card => card.id)).not.toContain(relics[0].id);
});

test("all relic names retain a specific English translation", () => {
  setLanguage("en");
  try {
    const names = relics.map(relic => bphRelicName(relic.id));
    expect(new Set(names).size).toBe(45);
    for (const name of names) expect(name).toMatch(/[A-Za-z]/);
  } finally {
    setLanguage("ko");
  }
});
