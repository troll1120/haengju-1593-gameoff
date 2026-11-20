// Current roster/depth rules, no meta upgrades; paired seeds for QA's two commanders.
// usage: bun scripts/measure-recheck.ts <count> <output.json>
import { advance, autoCard, choose, createRun, GENERALS, SOLDIERS, upgradeClass, useSkill } from "../src/rules";
import type { General, Run } from "../src/rules";
import { POLICIES, skillReason } from "../src/bots";
import { cardRarity } from "../src/cards";
import { setFieldSize } from "../src/geometry";

const count = Number(process.argv[2] ?? 12), output = process.argv[3];
if (!Number.isInteger(count) || count < 1 || !output) throw new Error("count and output path required");
const commanders: readonly General[] = process.argv[4] === "all" ? GENERALS : ["권율", "김시민"];
const roster = process.argv[5] === "legacy" ? GENERALS.slice(0, 8) : process.argv[5] === "starter" ? GENERALS.slice(0, 4) : GENERALS;
// begin() maps a 390x844 CSS arena to a 370x800 simulation field.
setFieldSize(370, 800);
const hashes = Object.fromEntries(await Promise.all(["rules", "roster", "cards", "synergy", "bots"].map(async name =>
  [name, new Bun.CryptoHasher("sha256").update(await Bun.file(`${import.meta.dir}/../src/${name}.ts`).bytes()).digest("hex")])));
type Row = {
  readonly commander: General; readonly mode: "idle" | "prompt" | "timed"; readonly seed: number;
  readonly outcome: Run["phase"]; readonly time: number; readonly cause: Run["lossCause"];
  readonly bossHp: number | null; readonly bossTtk: number | null; readonly bossCensoredAt: number | null;
  readonly skills: number; readonly generals: number; readonly level: number; readonly bosses: Run["metrics"]["bosses"];
};
const rows: Row[] = [];
for (const commander of commanders) for (const mode of ["idle", "prompt", "timed"] as const) {
  for (let seed = 1; seed <= count; seed++) {
    const run = createRun(seed, commander, undefined, roster), policy = mode === "idle" ? POLICIES.idle : mode === "prompt" ? POLICIES.mash : POLICIES.timed;
    let nextLook = 0, nextCard = 0, bossHp: number | null = null;
    for (let tick = 0; tick < 16000 && run.phase !== "won" && run.phase !== "lost"; tick++) {
      // Same as independent QA: hero first, then highest rarity, skills as soon as ready.
      // A 1.3s card reaction includes the visible slot animation.
      if (run.phase === "choice" && mode !== "idle" && run.time >= nextCard) {
        const hero = run.offers.find(card => card.startsWith("hero-"));
        const ranked = [...run.offers].sort((a, b) =>
          ["common", "rare", "epic", "legend", "cursed"].indexOf(cardRarity(b)) -
          ["common", "rare", "epic", "legend", "cursed"].indexOf(cardRarity(a)));
        choose(run, mode === "prompt" ? hero ?? ranked[0] : autoCard(run));
        nextCard = run.time + 1.3;
      }
      if (run.time >= nextLook) {
        nextLook = run.time + .2;
        for (const squad of run.squads) if (skillReason(run, squad, policy)) useSkill(run, squad.id);
        // Prompt matches QA's card/skill-only player; timed also uses the forge.
        if (mode === "timed") for (const kind of SOLDIERS) upgradeClass(run, kind);
      }
      advance(run, .05);
      const boss = run.enemies.find(enemy => enemy.boss && (enemy.appearedAt ?? 0) >= 240 && (enemy.appearedAt ?? 0) < 241);
      if (boss && bossHp === null) bossHp = boss.maxHp;
    }
    if (run.phase !== "won" && run.phase !== "lost") throw new Error(`unfinished ${mode}/${seed}`);
    const second = run.metrics.bosses[1];
    rows.push({ commander, mode, seed, outcome: run.phase, time: run.time, cause: run.lossCause,
      bossHp, bossTtk: second?.fallen == null ? null : second.fallen - second.appeared,
      bossCensoredAt: second?.fallen == null && second ? run.time - second.appeared : null,
      skills: run.metrics.skills.reduce((sum, n) => sum + n, 0), generals: run.squads.length, level: run.level,
      bosses: run.metrics.bosses });
  }
}
const quantile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)] ?? null;
const summaries = (["idle", "prompt", "timed"] as const).map(mode => {
  const group = rows.filter(row => row.mode === mode), times = group.map(row => row.time), ttk = group.flatMap(row => row.bossTtk === null ? [] : [row.bossTtk]);
  return { mode, runs: group.length, wins: group.filter(row => row.outcome === "won").length,
    reached540: group.filter(row => row.time >= 540).length,
    survival: { min: Math.min(...times), p25: quantile(times, .25), median: quantile(times, .5), p75: quantile(times, .75), max: Math.max(...times) },
    bossKills: ttk.length, bossTtk: { min: ttk.length ? Math.min(...ttk) : null, median: quantile(ttk, .5), max: ttk.length ? Math.max(...ttk) : null } };
});
await Bun.write(output, JSON.stringify({ hashes, field: [370, 800], count, commanders, roster, summaries, rows }, null, 2));
console.log(JSON.stringify(summaries));
