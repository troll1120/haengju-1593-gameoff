// usage: bun tools/meta-balance.ts [profiles=4] [runs=65] [out=out/meta-curve.json]
// This runs the shipped combat loop and shipped account purchases, never a surrogate survival formula.
import { advance, autoCard, buyRecruit, canRecruit, choose, classCount, createRun, GENERALS, GENERAL_CLASS, SOLDIERS, upgradeClass, useSkill } from "../src/rules";
import { POLICIES, skillReason } from "../src/bots";
import { award, bonusesOf, buyNode, canBuy, freshMeta, meritFor, META_NODES, TREE_NODES } from "../src/meta";
import type { General, Run } from "../src/rules";
import type { Meta } from "../src/meta";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { setFieldSize } from "../src/geometry";

type Profile = { readonly meta: Meta; readonly seed: number; readonly general: General; readonly idle?: boolean };
type Segment = { readonly at: number; readonly incoming: number; readonly kills: number; readonly fortDamage: number; readonly cards: readonly string[]; readonly evolution: number | null };
export function competent({ meta, seed, general, idle = false }: Profile): { run: Run; segments: Segment[] } {
  // Design (k)'s comparison cohort uses the four starting generals, even after
  // the free fifth unlock. General experimentation is a separate, slower curve.
  const run = createRun(seed, general, bonusesOf(meta), GENERALS.slice(0, 4));
  let nextLook = 0, chooseAt = Infinity, lastKills = 0, lastHp = run.wall + run.base, lastCard = 0, incoming = 0;
  const segments: Segment[] = [], seen = new Set<number>();
  while (run.phase !== "won" && run.phase !== "lost") {
    if (run.offers.length && chooseAt === Infinity) chooseAt = run.time + 1.3;
    if (!idle && run.offers.length && run.time >= chooseAt) {
      choose(run, autoCard(run)); chooseAt = Infinity;
    }
    if (!idle && run.time >= nextLook) {
      nextLook = run.time + .2;
      for (const squad of run.squads) if (skillReason(run, squad, POLICIES.timed)) useSkill(run, squad.id);
      for (const kind of [GENERAL_CLASS[general], "archer", "hwacha", "spearman", "monk"] as const) upgradeClass(run, kind);
      if (run.meta.caps?.drill) {
        const kind = [...SOLDIERS].filter(kind => canRecruit(run, kind))
          .sort((a, b) => run.drill[b] - run.drill[a] || classCount(run, a) - classCount(run, b))[0];
        if (kind) buyRecruit(run, kind);
      }
    }
    advance(run, .05);
    for (const enemy of run.enemies.flatMap(enemy => enemy.cargo ?? [enemy])) if (!seen.has(enemy.id)) { seen.add(enemy.id); incoming++; }
    if (run.time >= (segments.length + 1) * 30 || ["won", "lost"].includes(run.phase)) {
      segments.push({ at: run.time, incoming, kills: run.kills - lastKills, fortDamage: lastHp - run.wall - run.base,
        cards: run.metrics.cards.slice(lastCard), evolution: run.metrics.evolutionTimes[0] ?? null });
      incoming = 0; lastKills = run.kills; lastHp = run.wall + run.base; lastCard = run.metrics.cards.length;
    }
  }
  return { run, segments };
}
export function shop(meta: Meta, general: General): string[] {
  const bought: string[] = [];
  for (;;) {
    const spine = TREE_NODES.find(entry => entry.spine && canBuy(meta, entry.id));
    const cheap = TREE_NODES.filter(entry => !entry.spine && canBuy(meta, entry.id))
      .sort((a, b) => a.cost - b.cost || Number(b.id.startsWith(GENERAL_CLASS[general])) - Number(a.id.startsWith(GENERAL_CLASS[general])))[0];
    const entry = spine ?? cheap;
    if (!entry) return bought;
    buyNode(meta, entry.id); bought.push(entry.id);
  }
}
type CurveRow = { profile: number; general: General; run: number; seconds: number; merit: number; bought: string[]; nodes: number; tree: number; elapsed: number; won: boolean; base: number; kills: number; cause: Run["lossCause"]; bank: number; owned: string[]; segments: Segment[] };
export async function measureMeta(profiles: number, runs: number, out: string, startProfile = 0): Promise<void> {
setFieldSize(370, 800);
const rows: CurveRow[] = [];
for (let profile = startProfile; profile < startProfile + profiles; profile++) {
  const meta = freshMeta(), general = GENERALS[profile % 4];
  let elapsed = 0;
  for (let index = 1; index <= runs; index++) {
    const { run, segments } = competent({ meta, seed: profile * 10000 + index * 137 + 7, general });
    elapsed += run.time;
    const merit = award(meta, meritFor(run.kills, run.time, run.metrics.bosses.filter(boss => boss.fallen !== null).length), { seconds: run.time, won: run.phase === "won" });
    const bought = shop(meta, general);
    const row = { profile, general, run: index, seconds: Number(run.time.toFixed(1)), merit, bought, nodes: meta.nodes.length, tree: meta.nodes.filter(id => TREE_NODES.some(entry => entry.id === id)).length,
      elapsed: Number(elapsed.toFixed(1)), won: run.phase === "won", base: run.base / run.maxBase, kills: run.kills, cause: run.lossCause, bank: meta.merit, owned: [...meta.nodes], segments };
    rows.push(row);
    console.log(JSON.stringify({ ...row, owned: undefined, segments: undefined }));
  }
}
const firstWins = Array.from({ length: profiles }, (_, offset) => rows.find(row => row.profile === startProfile + offset && row.won));
const completeTree = Array.from({ length: profiles }, (_, offset) => rows.find(row => row.profile === startProfile + offset && row.tree === TREE_NODES.length));
const remainingCost = META_NODES.filter(entry => !TREE_NODES.includes(entry)).reduce((sum, entry) => sum + entry.cost, 0);
const tail = rows.filter(row => row.run > runs - 5);
const meanMerit = tail.reduce((sum, row) => sum + row.merit, 0) / tail.length;
const meanSeconds = tail.reduce((sum, row) => sum + row.seconds, 0) / tail.length;
const compact = (row: CurveRow | undefined) => row ? { profile: row.profile, general: row.general, run: row.run, elapsed: row.elapsed, base: row.base, bank: row.bank } : null;
const projection = { remainingCost, meanMerit, meanSeconds, extraRuns: Math.ceil(remainingCost / meanMerit),
  firstWins: firstWins.map(compact), completeTree: completeTree.map(compact),
  fullHours: completeTree.filter(row => row !== undefined).map(row => (row.elapsed + Math.ceil(Math.max(0, remainingCost - row.bank) / meanMerit) * meanSeconds) / 3600) };
await mkdir(dirname(out), { recursive: true });
await Bun.write(out, JSON.stringify({ profiles, startProfile, runs, rows, projection }, null, 2));
console.log("CURVE_DONE " + JSON.stringify(projection));
}
if (import.meta.main) await measureMeta(Number(process.argv[2] ?? 4), Number(process.argv[3] ?? 65), process.argv[4] ?? "out/meta-curve.json");
