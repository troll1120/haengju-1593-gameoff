import { expect } from "bun:test";
import { readFileSync } from "node:fs";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { bphSurvivalPlan } from "./bph-survival";
import { CHAOS_LEVELS } from "./chaos-contract";

// The archived attack starts at 100, now the free Lv2 boundary. Move the
// whole four-second attack window earlier without changing the tick duration.
const clockShift = 16;
const replayClockFields = new Set(["time", "strikeAt", "lockUntil", "hurtAt",
  "lastEffectAt", "maxQuietSeconds", "maxEventGap"]);
import type { Effect, Run } from "./rules";

const files = {
  권율: "gwon-yul",
  신립: "sin-rip",
  송상현: "song-sanghyeon",
  황진: "hwang-jin",
  김시민: "kim-simin",
  사명대사: "samyeong-daesa",
} as const;

export function historicalBasicReplay(general: keyof typeof files) {
  // Immutable 06bf9f5, 390x650, seed 144, post-advance JSON with original key order.
  const fixture = new URL(`./general-basic-replay-06bf9f5-${files[general]}.ndjson.gz`, import.meta.url);
  const frames = new TextDecoder("utf-8", { fatal: true }).decode(Bun.gunzipSync(readFileSync(fixture))).split("\n");
  expect(frames.length).toBe(120);
  const table = BPH_SURVIVAL_TABLE;
  const oldHpScale = 1 / 60;
  expect(table.generalHpScale / oldHpScale).toBe(69);
  expect(table.keepHp).toBe(0.0912);
  expect(table.generalBasic).toBe(3.6);
  expect(table.generalBasicGrowth).toBe(.08);
  const openingBasicScale = 3.6 * (1 + .08 * 4);

  // Accumulate in tick order to keep the exact floating-point subtraction/addition
  // used by the replay. Scaling cumulative totals would change some low bits.
  let nextTick = 0, historicalHit: number | undefined, supplyElapsed = 0;
  let oldDamage = 0, liveDamage = 0, oldEnemyHp = 10000, liveEnemyHp = 10000;
  return {
    frames,
    assertFrame(tick: number, run: Run, effects: readonly Effect[]) {
      const label = (path: string) => `${general} tick ${tick} ${path}`;
      expect(tick, label("frame order")).toBe(nextTick++);
      const frame = frames[tick];
      const [old, oldEffects] = JSON.parse(frame) as [Run, Effect[]];
      expect(JSON.stringify([old, oldEffects]) === frame, label("historical frame round-trip")).toBe(true);
      // The diagnostic samples every 10 seconds of battle time. Starting
      // earlier eliminates the last historical slots, with combat untouched.
      old.metrics.density = old.metrics.density.slice(0, Math.floor((old.time - clockShift) / 10) + 1);
      const numeric = (path: string, actual: number, expected: number) =>
        expect(actual, label(path)).toBe(expected);

      numeric("run.base", run.base, table.keepHp);
      numeric("run.maxBase", run.maxBase, table.keepHp);
      old.base = old.maxBase = table.keepHp;
      const squad = old.squads[0];
      const expectedHp = Math.round(squad.maxHp / oldHpScale) * table.generalHpScale;
      numeric("run.squads[0].hp", run.squads[0].hp, expectedHp);
      numeric("run.squads[0].maxHp", run.squads[0].maxHp, expectedHp);
      squad.hp = squad.maxHp = expectedHp;
      const battle = run.bph, oldSurvival = old.bph?.survival;
      if (!battle?.survival || !oldSurvival) throw new Error(label("missing survival state"));
      const exhausted = bphSurvivalPlan(battle.waveId).length;
      numeric("run.bph.survival.cursor", battle.survival.cursor, exhausted);
      oldSurvival.cursor = exhausted;
      const openingMods = CHAOS_LEVELS[general][5];
      expect(run.chaos, label("opening growth")).toMatchObject({ level: 1, xp: 0, mods: openingMods });
      if (!old.chaos || !openingMods) throw new Error(label("missing opening skill row"));
      old.chaos.mods = openingMods;

      const historicalTarget = old.enemies[0];
      for (const [index, hit] of oldEffects.entries()) {
        // Shin Rip's attack pose now tracks the struck enemy even after it moves.
        if (general === "신립" && (hit.kind === "swing" || hit.kind === "shot") && hit.squad === squad.id) {
          expect(effects[index]?.target, label(`effects[${index}].cavalry target`)).toBe(historicalTarget.id);
          hit.target = historicalTarget.id;
        }
        if (hit.kind !== "hit") continue;
        expect(hit.target, label(`historical effects[${index}].target`)).toBe(historicalTarget.id);
        historicalHit ??= old.metrics.classDamage.general;
        const damage = historicalHit * openingBasicScale;
        oldDamage += historicalHit;
        liveDamage += damage;
        oldEnemyHp -= historicalHit;
        liveEnemyHp -= damage;
        const display = Math.max(1, Math.round(damage));
        expect(effects[index]?.value, label(`effects[${index}].value`)).toBe(display);
        hit.value = display;
      }
      numeric("historical general damage", old.metrics.classDamage.general, oldDamage);
      numeric("historical enemy HP", historicalTarget.hp, oldEnemyHp);
      numeric("run.enemies[0].hp", run.enemies[0].hp, liveEnemyHp);
      numeric("run.metrics.classDamage.general", run.metrics.classDamage.general, liveDamage);
      numeric("run.metrics.damage.squads[0]", run.metrics.damage.squads[0], liveDamage);
      historicalTarget.hp = liveEnemyHp;
      old.metrics.classDamage.general = old.metrics.damage.squads[0] = liveDamage;
      const shot = old.shots[0];
      if (shot) {
        const expectedDamage = shot.damage * openingBasicScale;
        expect(run.shots[0]?.damage, label("run.shots[0].damage")).toBe(expectedDamage);
        shot.damage = expectedDamage;
      }

      // Adapt the expected fixture to the explicit contracts above. Compare the untouched live
      // bytes, including every key, array position, effect payload and order.
      // This four-second arena has no upgrades or collection. Account for the
      // newly unconditional supply clock without hiding any combat differences.
      expect(battle.save.unitUpgrades).toEqual({});
      const counters = battle.fx.counters;
      supplyElapsed += 1 / 30;
      numeric("barracks elapsed", counters["barracks:clock"], supplyElapsed);
      const actual = JSON.stringify([run, effects], function (key, value) {
        if (this === battle.save && (key === "unitUpgrades" || key === "medalScale")) return undefined;
        if (this === counters && key === "barracks:clock") return undefined;
        return value;
      });
      const expected = JSON.stringify([old, oldEffects], (key, value) =>
        replayClockFields.has(key) && typeof value === "number" && value >= 100 ? value - clockShift : value);
      if (actual !== expected) {
        let offset = 0;
        while (offset < Math.min(actual.length, expected.length) && actual[offset] === expected[offset]) offset++;
        throw new Error(label(`frame differs at character ${offset}: expected ${JSON.stringify(expected.slice(offset, offset + 48))}, got ${JSON.stringify(actual.slice(offset, offset + 48))}`));
      }
    },
  };
}
