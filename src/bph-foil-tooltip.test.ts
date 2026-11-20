import { expect, test } from "bun:test";
import { freshBphSave, parseBphSave } from "./bph-save";
import { takeBphFoilTooltip } from "./bph-foil-tooltip";
import { setLanguage } from "./i18n";

test("the first unit foil hint reports the actual Squire bonuses once across reloads without RNG", () => {
  setLanguage("en");
  const save = freshBphSave(725);
  save.foils.push("Hero1_Squire");
  const rng = save.rng;
  expect(takeBphFoilTooltip(save)).toEqual({
    profileId: "Hero1_Squire", bonuses: ["HP ×2", "Attack ×1.5"],
  });
  expect(save.rng).toBe(rng);
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  restored.foils.push("Hero1_Barbarian");
  expect(takeBphFoilTooltip(restored)).toBeNull();
  expect(restored.rng).toBe(rng);
  setLanguage("ko");
});

test("a foil tome cannot consume the first unit hint", () => {
  const save = freshBphSave(82);
  save.foils.push("Tome_Thunderstorm");
  expect(takeBphFoilTooltip(save)).toBeNull();
  expect(save.foilTooltipSeen).toBeUndefined();
  save.foils.push("Hero1_Barbarian");
  expect(takeBphFoilTooltip(save)?.bonuses).toEqual(["체력 ×2", "공격 범위 ×1.5"]);
  expect(save.rng).toBe(82);
});

test("older saves with a discovered unit foil receive the missing hint once", () => {
  const save = parseBphSave({ ...freshBphSave(28), foils: ["Hero1_Archer"] });
  expect(takeBphFoilTooltip(save)?.bonuses).toEqual(["체력 ×1.5", "공격 속도 ×1.5"]);
  expect(takeBphFoilTooltip(save)).toBeNull();
});

test("a seen flag from before the reveal-close trigger re-arms exactly once (owner DM 1794926405)", () => {
  const legacy = { ...freshBphSave(5), foils: ["Hero1_Squire"], foilTooltipSeen: true };
  delete (legacy as Partial<typeof legacy>).foilHintVersion;
  const rearmed = parseBphSave(legacy);
  expect(rearmed.foilTooltipSeen).toBe(true);
  expect(takeBphFoilTooltip(rearmed)?.profileId).toBe("Hero1_Squire");
  expect(takeBphFoilTooltip(rearmed)).toBeNull();
  expect(takeBphFoilTooltip(parseBphSave(JSON.parse(JSON.stringify(rearmed))))).toBeNull();
});
