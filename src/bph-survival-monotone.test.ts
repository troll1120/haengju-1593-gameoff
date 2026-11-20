import { expect, test } from "bun:test";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";

// Owner 1795158667.502949 "왜 공격력이 내려가? 올라가야지 ???": enemy strength never eases as the battle goes on.
test("ordinary enemy damage rises at every step and their hp never drops", () => {
  const rows = BPH_SURVIVAL_TABLE.intensity, failures: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const [prev, row] = [rows[i - 1], rows[i]];
    if (!(row.at > prev.at)) failures.push(`${row.at}s: not after ${prev.at}s`);
    if (!(row.unitDamage > prev.unitDamage)) failures.push(`${row.at}s unitDamage ${row.unitDamage} <= ${prev.unitDamage}`);
    if (!(row.castleDamage > prev.castleDamage)) failures.push(`${row.at}s castleDamage ${row.castleDamage} <= ${prev.castleDamage}`);
    if (row.hp < prev.hp) failures.push(`${row.at}s hp ${row.hp} < ${prev.hp}`);
  }
  expect(failures).toEqual([]);
});

test("later bosses never hit softer or carry less hp", () => {
  const rows = BPH_SURVIVAL_TABLE.bosses, failures: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const [prev, row] = [rows[i - 1], rows[i]];
    for (const key of ["hp", "unitDamage", "castleDamage"] as const) {
      if (row[key] < prev[key]) failures.push(`boss at ${row.at}s ${key} ${row[key]} < ${prev[key]}`);
    }
  }
  expect(failures).toEqual([]);
});
