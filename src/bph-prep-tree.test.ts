import { expect, test } from "bun:test";
import { BPH_GENERALS } from "./bph-commanders";
import { BPH_PROFILES } from "./bph-data";
import { bphPrepPlacementGroup } from "./bph-prep-card-groups";
import { prepPlacementUniverse, prepTreeLayout, renderPrepTree } from "./bph-prep-tree";
import { PREP_HEIGHT, PREP_PITCH, PREP_STEP, prepLinkPoints } from "./bph-prep-columns";
import { freshBphSave } from "./bph-save";
import { bphPrepUpgradeNodes } from "./bph-upgrade-tree-nodes";
import { BPH_PLACEMENTS, BPH_UPGRADE_GRIDS, visibleBphPlacements } from "./bph-upgrades";

test("a fresh collection exposes every unit exactly once and retains the monk's real recruit source", () => {
  const save = freshBphSave();
  const trees = (["militia", "government", "elite"] as const).map(tab => prepTreeLayout(save, tab, []));
  const cards = trees.flat().filter(n => n.face.kind === "card");
  expect(cards.map(n => n.face.id).sort()).toEqual(Object.keys(BPH_PROFILES).sort());
  expect(cards).toHaveLength(37);
  const monk = trees[0].find(n => n.face.id === "Hero2_Monk")!;
  expect(monk.dim).toBe(true);
  expect([...monk.parents]).toEqual(["Pack2_Advanced"]);
  save.discovered.push("Hero2_Monk");
  expect(prepTreeLayout(save, "militia", []).find(n => n.face.id === "Hero2_Monk")?.dim).toBe(false);
});

test("authored branches precede their children and leave three separate phone-width hit areas per row", () => {
  const save = freshBphSave();
  for (const tab of ["militia", "government", "elite"] as const) {
    const nodes = prepTreeLayout(save, tab, []);
    for (const n of nodes) {
      const siblings = nodes.filter(item => item.row === n.row);
      expect(siblings.length).toBeLessThanOrEqual(3);
      expect(siblings.filter(item => Math.abs(item.x - n.x) < 100)).toEqual([n]);
      for (const parent of n.parents) expect(nodes.find(p => p.face.id === parent)!.row).toBeLessThan(n.row);
    }
    const parents = (id: string) => [...nodes.find(n => n.face.id === id)!.parents].sort();
    if (tab === "militia") {
      expect(parents("Hero1_Squire2")).toEqual(["Hero1_Squire"]);
      expect(parents("Hero1_Squire3")).toEqual(["Hero1_Squire2"]);
      expect(parents("Hero1_Archer")).toEqual(["Pack1_Basic"]);
    }
    if (tab === "government") {
      expect(parents("Hero5_DinoRider")).toEqual(["Hero5_Dino", "Hero5_Rider"]);
      expect(parents("Hero_Bear")).toEqual(["Hero5_Beastmaster"]);
    }
  }
});

test("shared placement selections retain their complete purchase keys and the caller's reveal boundary", () => {
  const save = freshBphSave(), ids = ["_SkillTreeMain_Demo:23:15", "_SkillTreeMain_Demo:23:19"];
  const visible = bphPrepUpgradeNodes(save, ids.map(id => BPH_PLACEMENTS.get(id)!));
  // Every seat is laid out from the start; only the caller's revealed cells carry an identity.
  const seats = prepPlacementUniverse("shared").map(p => p.id);
  const hidden = prepTreeLayout(save, "shared", []);
  expect(hidden.map(n => n.face.id)).toEqual(expect.arrayContaining(ids));
  expect(hidden.length).toBe(seats.length);
  expect(hidden.every(n => n.unrevealed && n.dim && n.concealed && n.label === "???")).toBe(true);
  const shown = prepTreeLayout(save, "shared", visible);
  expect(shown.filter(n => !n.unrevealed).map(n => n.face).sort((a,b) => a.id.localeCompare(b.id)))
    .toEqual(ids.map(id => ({ kind: "placement", id })));
  // The first monk upgrade is hidden by design. Use the visible monk quest.
  const target = BPH_PLACEMENTS.get("_SkillTreeMain_Demo:28:30")!;
  expect(bphPrepPlacementGroup(target.id)).toEqual({ tab: "militia", card: "Hero2_Monk" });
  const monkPlacements = bphPrepUpgradeNodes(save, [target]);
  expect(monkPlacements).toHaveLength(1);
  expect(prepTreeLayout(save, "militia", monkPlacements).some(n => n.face.id === target.id)).toBe(false);
});

test("each general has an independent selectable identity and retains the saved unlock state", () => {
  const save = freshBphSave();
  save.unlockedGenerals.push("이순신");
  const nodes = prepTreeLayout(save, "general", []).filter(n => n.face.kind === "general");
  expect(nodes.map(n => n.face)).toEqual(BPH_GENERALS.map(id => ({ kind: "general", id })));
  expect(nodes.filter(n => !n.dim).map(n => n.face.id)).toEqual(["권율", "이순신"]);
  expect(nodes.every(n => n.parents.size === 0)).toBe(true);
});

test("shared branches project the live prerequisite frontier and never join visually adjacent unrelated cells", () => {
  const save = freshBphSave(), root = BPH_PLACEMENTS.get("_SkillTreeMain_Demo:23:15")!;
  // Open the starter neighborhood in the save. The actual graph helper decides
  // how far the connector cells reveal and which of those placements are parents.
  save.purchasedPlacements.push(root.id);
  const visible = bphPrepUpgradeNodes(save, visibleBphPlacements(save, root.gridId));
  const model = prepTreeLayout(save, "shared", visible), byId = new Map(model.map(n => [n.face.id, n]));
  const edges = model.flatMap(n => [...n.parents].map(id => ({ parent: id, child: n })));
  expect(edges.length).toBeGreaterThan(0);
  for (const { parent, child } of edges) expect(byId.get(parent)!.row).toBeLessThan(child.row);
  // The fixed links still carry every live requirement between two shown cells.
  let live = 0;
  for (const node of visible) for (const p of node.prereqs) {
    const child = byId.get(node.id)!, parent = byId.get(p.id);
    if (!child || !parent) continue; // another tab's or a card's placement
    live++;
    expect(child.parents.has(p.id) || parent.parents.has(node.id)).toBe(true);
  }
  expect(live).toBeGreaterThan(0);
});

test("keeps the starter's directed edges, including the secondary parent", () => {
  const save = freshBphSave(7), grid = "_SkillTreeMain_Demo", key = (cell: string) => `${grid}:${cell}`;
  save.purchasedPlacements.push(key("23:15"));
  const nodes = prepTreeLayout(save, "shared", bphPrepUpgradeNodes(save, visibleBphPlacements(save, grid)));
  const parents = (cell: string) => [...nodes.find(n => n.face.id === key(cell))!.parents].sort();
  expect(nodes[0].face.id).toBe(key("23:15"));
  expect(parents("24:14")).toEqual([key("23:15")]);
  expect(parents("23:19")).toEqual([key("23:15")]);
  expect(parents("25:17")).toEqual([key("23:15"), key("24:14")]);
});

test("a purchase or reveal never moves any cell: every seat is fixed from a fresh save onward", () => {
  // castle 1120 owner report: buying an upgrade reshuffled the tree. Seats now come from the authored grid.
  const grid = "_SkillTreeMain_Demo", key = (cell: string) => `${grid}:${cell}`;
  const seats = (save: ReturnType<typeof freshBphSave>, tab: Parameters<typeof prepTreeLayout>[1]) => {
    const visible = bphPrepUpgradeNodes(save, BPH_UPGRADE_GRIDS.flatMap(g => visibleBphPlacements(save, g.id)));
    return new Map(prepTreeLayout(save, tab, visible).map(n => [n.face.id, `${n.row}:${n.x}:${n.columns}:${[...n.parents].sort()}`]));
  };
  const fresh = freshBphSave(7);
  // The previous layout flipped 24:14 and 23:19 after 24:13, and pushed later cells down on every reveal.
  const steps = [[], ["23:15"], ["23:15","24:14"], ["23:15","24:14","24:13"], ["23:15","24:14","24:13","25:17","25:18","25:19"],
    ["23:15","20:14","21:14","21:15","22:15","21:16","20:16","19:16"]];
  const tabs = ["shared","general","militia","government","elite"] as const;
  for (const tab of tabs) {
    const before = seats(fresh, tab);
    expect(before.size).toBeGreaterThan(0);
    for (const progress of steps) {
      const save = freshBphSave(7);
      save.purchasedPlacements = progress.map(key);
      expect(seats(save, tab)).toEqual(before);
    }
    // A late save: everything reachable bought, every unit found, every pack opened.
    const late = freshBphSave(7), universe = prepPlacementUniverse(tab).map(p => p.id);
    late.purchasedPlacements = tabs.flatMap(t => prepPlacementUniverse(t).map(p => p.id));
    late.discovered = Object.keys(BPH_PROFILES);
    expect(seats(late, tab)).toEqual(before);
    // Nothing the save reveals can fall outside the fixed seats.
    const revealed = bphPrepUpgradeNodes(late, BPH_UPGRADE_GRIDS.flatMap(g => visibleBphPlacements(late, g.id)))
      .filter(n => { const g = bphPrepPlacementGroup(n.id); return g.tab === tab && !g.card; }).map(n => n.id);
    expect(universe).toEqual(expect.arrayContaining(revealed));
  }
});

test("every link joins the two centre ports with at most one bend, clear of every unrelated node", () => {
  const save = freshBphSave(7);
  for (const progress of [[], ["23:15"], ["23:15","20:14","21:14","21:15","22:15","21:16","20:16","19:16"]]) {
    save.purchasedPlacements = progress.map(cell => `_SkillTreeMain_Demo:${cell}`);
    const visible = bphPrepUpgradeNodes(save, visibleBphPlacements(save, "_SkillTreeMain_Demo"));
    for (const tab of ["shared","government","militia","elite","general"] as const) {
      const nodes = prepTreeLayout(save, tab, visible);
      for (const child of nodes) for (const id of child.parents) {
        const parent = nodes.find(p => p.face.id === id)!;
        const points = prepLinkPoints(parent, child);
        expect(points[0]).toEqual([parent.x, parent.row * PREP_STEP + PREP_HEIGHT]);
        expect(points.at(-1)).toEqual([child.x, child.row * PREP_STEP]);
        expect(points.length).toBeLessThanOrEqual(3);
        for (const node of nodes) {
          if (node === parent || node === child) continue;
          const top = node.row * PREP_STEP, bottom = top + PREP_HEIGHT;
          for (let i = 1; i < points.length; i++) {
            const [x, y] = points[i-1], [xx, yy] = points[i];
            const lo = Math.max(y, top), hi = Math.min(yy, bottom);
            if (lo > hi) continue;
            const at = (v: number) => x + (xx-x)*(v-y)/(yy-y);
            const range = [at(lo), at(hi)].sort((a,b) => a-b);
            // Full pitch less the CSS gutter is a conservative node rectangle.
            expect(range[1] <= node.x - PREP_PITCH/2 || range[0] >= node.x + PREP_PITCH/2).toBe(true);
          }
        }
      }
    }
  }
});

test("rendered shared links avoid side rails and only highlight open paths", () => {
  // Record the DOM writes without a browser dependency in the unit suite.
  class Element {
    children: Element[] = [];
    dataset: Record<string, string> = {};
    style = { setProperty() {} };
    attributes = new Map<string, string>();
    append(...nodes: Element[]) { this.children.push(...nodes); }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => new Element(), createElementNS: () => new Element(),
  } });
  try {
    const save = freshBphSave(7), grid = "_SkillTreeMain_Demo";
    save.purchasedPlacements.push(`${grid}:23:15`, `${grid}:24:14`);
    const visible = bphPrepUpgradeNodes(save, visibleBphPlacements(save, grid));
    const tree = renderPrepTree(save, "shared", visible, () => {}) as unknown as Element;
    const [svg, ...cards] = tree.children[0].children;
    const byId = new Map(cards.map(card => [card.dataset.placement, card]));
    expect(svg.children.length).toBeGreaterThan(0);
    for (const path of svg.children) {
      expect(path.attributes.get("d")).toMatch(/^M[-\d.]+ [-\d.]+(?:L[-\d.]+ [-\d.]+){1,2}$/);
      const open = [path.dataset.from, path.dataset.to].every(id => byId.get(id)?.dataset.dim === "false");
      expect(path.dataset.unlocked).toBe(String(open));
    }
    expect(new Set(svg.children.map(path => path.dataset.unlocked))).toEqual(new Set(["true", "false"]));
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
