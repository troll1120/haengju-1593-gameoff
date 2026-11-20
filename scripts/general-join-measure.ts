import { strict as assert } from "node:assert";
import { parseArgs } from "node:util";
import { mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { BPH_GENERALS } from "../src/bph-commanders";
import type { BphGeneral } from "../src/bph-commanders";
import { freshMeta } from "../src/meta";
import { freshBphSave } from "../src/bph-save";
import { survivalFixture } from "./survival-fixtures";
import type { SurvivalState } from "./survival-fixtures";
import { simulateSurvival } from "./survival-sim";

// Runs unchanged on 0f412af (the no-join control) and on the join branch: the same carried account, only the code differs.
const { values } = parseArgs({ options: {
  arm: { type: "string" }, chapter: { type: "string" }, state: { type: "string" }, unlocked: { type: "string" },
  from: { type: "string", default: "1" }, to: { type: "string", default: "30" }, out: { type: "string", default: "measure-out" },
  plan: { type: "string" }, summarize: { type: "string", multiple: true },
}, strict: true });

const STATES = ["none", "typical", "full144"] as const;
const COUNTS = [1, 2, 4, 8] as const;
const unlockedOf = (spec: string): BphGeneral[] => /^\d+$/.test(spec) ? BPH_GENERALS.slice(0, Number(spec))
  : spec.split(",").map(name => { const general = BPH_GENERALS.find(item => item === name); assert(general, name); return general; });

type Row = {
  arm: string; chapter: number; state: string; unlocked: string; seed: number; survival: number; phase: string; kills: number;
  castleFallTime: number | null; generalFalls: number; generalFallCounts: unknown;
  joins: readonly { time: number; offered: readonly string[]; general: string }[];
  bossTimes: readonly { appeared: number; fallen: number | null; final: boolean }[];
};

if (values.plan) {
  const [arm, part = "all"] = values.plan.split(":");
  const lines: string[] = [];
  const add = (chapter: number, state: string, unlocked: string, seeds = [1, 11, 21]) => { for (const from of seeds)
    lines.push(`--arm ${arm} --chapter ${chapter} --state ${state} --unlocked ${unlocked} --from ${from} --to ${from + 9}`); };
  // General codex entries pay no gold or relic, so a control with more unlocked generals plays the one-general control; two cohorts check it.
  if (arm === "control") {
    for (let chapter = 1; chapter <= 4; chapter++) for (const state of STATES) add(chapter, state, "1");
    add(1, "none", "8", [1]); add(3, "typical", "8", [1]);
  } else {
    const chapters = part === "c1" ? [1] : part === "c2" ? [2] : part === "c34" ? [3, 4] : [1, 2, 3, 4];
    for (const chapter of chapters) for (const state of STATES) for (const count of COUNTS) if (count > 1 || chapter === 1) add(chapter, state, String(count));
    if (part === "c2" || part === "all") for (const joiner of BPH_GENERALS.slice(2)) add(1, "none", `권율,${joiner}`);
  }
  console.log(lines.join("\n"));
} else if (values.summarize) {
  const rows: Row[] = [];
  for (const directory of values.summarize) for (const name of (await readdir(directory)).filter(file => file.endsWith(".json")))
    rows.push(...(await Bun.file(resolve(directory, name)).json()) as Row[]);
  const median = (list: readonly number[]) => { const s = [...list].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length ? s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 : null; };
  const play = (row: Row) => JSON.stringify([row.survival, row.phase, row.kills, row.castleFallTime, row.generalFalls, row.generalFallCounts, row.joins, row.bossTimes]);
  const pick = (arm: string, chapter: number, state: string, unlocked: string) => rows.filter(row => row.arm === arm && row.chapter === chapter
    && row.state === state && row.unlocked === unlocked).sort((a, b) => a.seed - b.seed);
  const stats = (group: Row[]) => ({ runs: group.length, won: group.filter(row => row.phase === "won").length,
    medianSurvival: median(group.map(row => row.survival)), medianKills: median(group.map(row => row.kills)),
    reached170: group.filter(row => row.survival >= 170).length, reached350: group.filter(row => row.survival >= 350).length,
    generalFalls: group.reduce((sum, row) => sum + row.generalFalls, 0) });
  const controlCheck = rows.filter(row => row.arm === "control" && row.unlocked !== "1").map(row => {
    const twin = pick("control", row.chapter, row.state, "1").find(other => other.seed === row.seed);
    return { chapter: row.chapter, state: row.state, unlocked: row.unlocked, seed: row.seed, identical: !!twin && play(twin) === play(row) };
  });
  const cohorts = [...new Set(rows.filter(row => row.arm === "join").map(row => `${row.chapter}|${row.state}|${row.unlocked}`))];
  const summary = cohorts.map(key => {
    const [chapterText, state, unlocked] = key.split("|"), chapter = Number(chapterText);
    const join = pick("join", chapter, state, unlocked), control = pick("control", chapter, state, "1");
    const paired = join.flatMap(row => { const twin = control.find(other => other.seed === row.seed);
      return twin ? [{ survival: row.survival - twin.survival, kills: row.kills - twin.kills, identical: play(row) === play(twin) }] : []; });
    return { chapter, state, unlocked, join: stats(join), control: stats(control),
      medianSurvivalDelta: median(paired.map(pair => pair.survival)), medianKillsDelta: median(paired.map(pair => pair.kills)),
      identicalSeeds: paired.filter(pair => pair.identical).length, joinedRuns: join.filter(row => row.joins.length).length,
      firstJoinTimes: [...new Set(join.flatMap(row => row.joins[0] ? [Math.round(row.joins[0].time * 100) / 100] : []))],
      secondJoinTimes: [...new Set(join.flatMap(row => row.joins[1] ? [Math.round(row.joins[1].time * 100) / 100] : []))],
      picked: join.flatMap(row => row.joins.map(entry => entry.general)).reduce<Record<string, number>>((count, name) => ({ ...count, [name]: (count[name] ?? 0) + 1 }), {}),
      joinedFalls: join.flatMap(row => (row.generalFallCounts as { general: string; squad: number; falls: number }[]).filter(entry => entry.squad > 0)).reduce<Record<string, number>>((count, entry) => ({ ...count, [entry.general]: (count[entry.general] ?? 0) + entry.falls }), {}),
      bossAppearances: [0, 1, 2].map(beat => [...new Set(join.flatMap(row => row.joins.length && row.bossTimes[beat] ? [row.bossTimes[beat].appeared] : []))]) };
  }).sort((a, b) => a.chapter - b.chapter || a.state.localeCompare(b.state) || a.unlocked.localeCompare(b.unlocked));
  await Bun.write(resolve(values.summarize[0], "..", "summary.json"), JSON.stringify({ controlCheck, summary }, null, 2) + "\n");
  console.log(JSON.stringify({ controlIdentical: `${controlCheck.filter(item => item.identical).length}/${controlCheck.length}`, cohorts: summary.length }));
} else {
  const arm = values.arm, chapter = Number(values.chapter), state = values.state as SurvivalState, from = Number(values.from), to = Number(values.to);
  assert(arm === "join" || arm === "control", "--arm join|control");
  assert(Number.isInteger(chapter) && chapter >= 1 && chapter <= 4 && STATES.some(item => item === state) && values.unlocked);
  const unlocked = unlockedOf(values.unlocked), placements = (await survivalFixture(state)).purchasedPlacements;
  const rows: Row[] = [];
  for (let seed = from; seed <= to; seed++) {
    const meta = freshMeta(), save = freshBphSave(seed);
    save.chapter = chapter - 1; save.purchasedPlacements = [...placements]; save.unlockedGenerals = [...unlocked];
    const row = await simulateSurvival({ seed, chapter, general: "권율", state, policy: "cursor0", account: { meta, save } }) as Awaited<ReturnType<typeof simulateSurvival>> & Partial<Pick<Row, "joins" | "bossTimes">>;
    rows.push({ arm, chapter, state, unlocked: values.unlocked, seed, survival: row.survival, phase: row.phase, kills: row.kills,
      castleFallTime: row.castleFallTime, generalFalls: row.generalFalls, generalFallCounts: row.generalFallCounts,
      joins: row.joins ?? [], bossTimes: row.bossTimes ?? [] });
  }
  await mkdir(resolve(values.out), { recursive: true });
  await Bun.write(resolve(values.out, `${arm}-C${chapter}-${state}-u${values.unlocked.replaceAll(",", "+")}-${from}.json`), JSON.stringify(rows) + "\n");
  console.log(`PART_DONE arm=${arm} chapter=${chapter} state=${state} unlocked=${values.unlocked} seeds=${from}-${to}`);
}
