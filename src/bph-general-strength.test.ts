import { beforeAll, expect, test } from "bun:test";
import { BPH_GENERALS } from "./bph-commanders";
import { BPH_PACKS, BPH_PROFILES } from "./bph-data";
import { prepareBphUpgrades } from "./bph-upgrades";
import { setFieldSize } from "./geometry";
import { GENERAL_UPGRADE_PERCENT } from "./bph-general-upgrades";
import { effectiveHp, measureDps, recruitmentAvailability, type Subject } from "./bph-general-strength-fixture";

beforeAll(async () => {
  await prepareBphUpgrades();
  setFieldSize(370, 800);
});

// Owner 1795156512.433979 "아 그래도 돼 업그레이드 있잖아", 1795156516.512049 "왜 그걸 고려안하니~":
// a Lv1 general need not beat every recruit. It outclasses the recruits of its own stage (the packs the
// account can open), and general upgrades plus levels widen the gap until it overtakes the strongest recruit.
test("survival generals outclass their stage's recruits and upgrades and levels widen the gap", () => {
  const account = "raw";
  const power = (subject: Subject, level: number, rank = 0) => {
    // Only ordinary enemies share the board: a miniboss spawning beside the probe target would split the strikes.
    const durableHp = effectiveHp(subject, level, account, rank, true).effectiveHp;
    const dps = measureDps(subject, level, account, false, rank, true).dps;
    if (durableHp === null || !Number.isFinite(durableHp * dps)) {
      throw new Error(`${subject.id} Lv${level} rank ${rank}: invalid effective HP ${durableHp} or DPS ${dps}`);
    }
    return durableHp * dps;
  };
  const stage = recruitmentAvailability(account);
  expect(stage.unlockedPacks).toEqual(["Pack1_Basic"]);
  const stageRecruits = [...new Set(stage.unlockedPacks.flatMap(id => BPH_PACKS[id].pool.map(entry => entry.id)))].filter(id => BPH_PROFILES[id]);
  const allRecruits = [...new Set(Object.values(BPH_PACKS).flatMap(pack => pack.pool.map(entry => entry.id)))].filter(id => BPH_PROFILES[id]);
  const stageBest = Math.max(...stageRecruits.map(id => power({ kind: "soldier", id }, 1)));
  const strongest = Math.max(...allRecruits.map(id => power({ kind: "soldier", id }, 1)));
  expect(stageBest).toBeGreaterThan(0);
  const failures: string[] = [];
  for (const general of BPH_GENERALS) {
    const levels = [1, 5, 10, 20], ranks = [0, 10, 20];
    const table = ranks.map(rank => levels.map(level => power({ kind: "general", id: general }, level, rank)));
    for (const [r, rank] of ranks.entries()) for (const [l, level] of levels.entries()) {
      const label = `${general} Lv${level} rank ${rank}`, value = table[r][l];
      if (value < 20 * stageBest) failures.push(`${label}: ${value} < 20 × stage recruit ${stageBest}`);
      if (l > 0 && value <= table[r][l - 1]) failures.push(`${label}: did not grow with level`);
      if (r > 0 && value <= table[r - 1][l]) failures.push(`${label}: did not grow with upgrades`);
      const gain = value / table[0][l], expected = (1 + rank * GENERAL_UPGRADE_PERCENT / 100) ** 2;
      // Health and attack ranks multiply; a Lv20 strike against one target can overkill, so a little of the attack rank is lost.
      if (gain < .9 * expected || gain > expected * 1.01) failures.push(`${label}: upgrade gain ${gain} outside 90-101% of health × attack ${expected}`);
    }
    if (table[1][3] <= strongest) failures.push(`${general} Lv20 rank 10: ${table[1][3]} <= strongest recruit ${strongest}`);
    if (table[2][2] <= strongest) failures.push(`${general} Lv10 rank 20: ${table[2][2]} <= strongest recruit ${strongest}`);
  }
  expect(failures).toEqual([]);
}, 300_000);
