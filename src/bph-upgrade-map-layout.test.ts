import { expect, test } from "bun:test";
import { BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES, prepareBphUpgrades } from "./bph-upgrades";
import { bphMapLayout } from "./bph-upgrade-map-layout";

await prepareBphUpgrades();
const placements = [...BPH_PLACEMENTS.values()].filter(p => p.nodeId);

test("every grid shares one map without two nodes on one cell, and keeps its own shape", () => {
  const layout = bphMapLayout();
  const cells = placements.map(p => layout.cell(p).join(","));
  expect(new Set(cells).size).toBe(cells.length);
  for (const p of placements) {
    const [c, r] = layout.cell(p);
    expect(c >= 0 && c < layout.width && r >= 0 && r < layout.height).toBe(true);
  }
  for (const grid of new Set(placements.map(p => p.gridId))) {
    const [first, ...rest] = placements.filter(p => p.gridId === grid);
    const [c0, r0] = layout.cell(first);
    for (const p of rest) expect(layout.cell(p)).toEqual([c0 + p.x - first.x, r0 - (p.y - first.y)]);
  }
});

test("each home-tree entrance is linked by a straight-segment path to the first node of the grid it opens", () => {
  const layout = bphMapLayout();
  const entrances = placements.filter(p => p.gridId === BPH_DEFAULT_GRID && BPH_UPGRADE_NODES[p.nodeId!].refs.riftSkillTreeGrid);
  expect(entrances.length).toBe(4);
  for (const entrance of entrances) {
    const link = layout.links.find(l => l.from.id === entrance.id)!;
    expect(link.to.gridId).toBe(BPH_UPGRADE_NODES[entrance.nodeId!].refs.riftSkillTreeGrid!);
    expect(link.to.start).toBe(true);
    expect(link.path[0]).toEqual(layout.cell(entrance));
    expect(link.path.at(-1)).toEqual(layout.cell(link.to));
    for (let i = 1; i < link.path.length; i++)
      expect(link.path[i][0] === link.path[i - 1][0] || link.path[i][1] === link.path[i - 1][1]).toBe(true);
  }
});

test("no grid floats apart: each sits within three cells of another grid", () => {
  const layout = bphMapLayout();
  const grids = [...new Set(placements.map(p => p.gridId))];
  for (const grid of grids) {
    const own = placements.filter(p => p.gridId === grid).map(p => layout.cell(p));
    const others = placements.filter(p => p.gridId !== grid).map(p => layout.cell(p));
    const nearest = Math.min(...own.flatMap(([c, r]) => others.map(([oc, or]) => Math.max(Math.abs(c - oc), Math.abs(r - or)))));
    expect(nearest).toBeLessThanOrEqual(3);
  }
});
