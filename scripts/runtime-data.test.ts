import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runtimeData } from "./runtime-data";
import { BPH_PROFILES, BPH_TOMES } from "../src/bph-data";

test("the production projection retains every consumed combat field and authored number", async () => {
  const plugin = runtimeData();
  if (typeof plugin.transform !== "function") throw new Error("Missing data projection");
  const id = `${process.cwd()}/src/bph-data.ts`;
  const transformed = await Reflect.apply(plugin.transform, {}, [readFileSync(id, "utf8"), id]);
  if (typeof transformed !== "string") throw new Error("Missing projected source");
  const script = new Bun.Transpiler({ loader: "ts" }).transformSync(transformed);
  const projected = await import(`data:text/javascript;base64,${Buffer.from(script).toString("base64")}`);
  for (const [name, original] of Object.entries({ ...BPH_PROFILES, ...BPH_TOMES })) {
    const current = projected.BPH_PROFILES[name] ?? projected.BPH_TOMES[name];
    for (const [field, value] of Object.entries(current.raw)) expect(value).toEqual(original.raw[field]);
    if ("hp" in original) expect(current.hp).toBe(original.hp);
    if ("damage" in original) expect(current.damage).toBe(original.damage);
  }
  expect(projected.BPH_PROFILES.Hero1_Squire.raw.heroClass).toBe(BPH_PROFILES.Hero1_Squire.raw.heroClass);
  expect(projected.BPH_PROFILES.Hero1_Squire.raw.m_GameObject).toBeUndefined();
});
