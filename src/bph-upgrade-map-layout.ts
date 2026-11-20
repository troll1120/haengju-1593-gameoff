import { BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import type { BphPlacement } from "./bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { BPH_PLACEMENTS, BPH_UPGRADE_GRIDS, BPH_UPGRADE_NODES } from "./bph-upgrades";

/** One map: the home tree stays put and every other grid is moved, as a whole, next to it. */
export interface BphMapLayout {
  readonly width: number;
  readonly height: number;
  /** Map cell of a placement (column, row from the top-left corner). */
  readonly cell: (p: BphPlacement) => readonly [number, number];
  /** Drawn path from a home-tree entrance to the first node of the grid it opens. */
  readonly links: readonly { readonly from: BphPlacement; readonly to: BphPlacement; readonly path: readonly (readonly [number, number])[] }[];
}

type Cell = readonly [number, number];
const key = (c: number, r: number) => `${c},${r}`;
const GAP = 2, MARGIN = 1, TURN = 3, CROSS_LINE = 8, CROSS_NODE = 60;
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export function bphMapLayout(): BphMapLayout {
  const byGrid = new Map<string, BphPlacement[]>();
  for (const p of BPH_PLACEMENTS.values()) if (p.nodeId) byGrid.set(p.gridId, [...byGrid.get(p.gridId) ?? [], p]);
  // Icon cells carry a picture; line cells are the authored connector pieces drawn as lines only.
  const kind = (p: BphPlacement) => {
    const node = BPH_UPGRADE_NODES[p.nodeId!];
    return [1, 2, 3].includes(node.type) && !BPH_HIDDEN_UPGRADES.has(node.id) ? "line" : "icon";
  };
  const occupied = new Map<string, "line" | "icon">();
  const offsets = new Map<string, Cell>();
  const local = (p: BphPlacement): Cell => [p.x, -p.y];
  const place = (grid: string, offset: Cell) => {
    offsets.set(grid, offset);
    for (const p of byGrid.get(grid) ?? []) occupied.set(key(local(p)[0] + offset[0], local(p)[1] + offset[1]), kind(p));
  };
  const at = (p: BphPlacement): Cell => {
    const [dc, dr] = offsets.get(p.gridId)!;
    return [local(p)[0] + dc, local(p)[1] + dr];
  };
  const clear = (grid: string, [dc, dr]: Cell) => (byGrid.get(grid) ?? []).every(p => {
    const [c, r] = local(p);
    for (let x = -GAP; x <= GAP; x++) for (let y = -GAP; y <= GAP; y++) if (occupied.has(key(c + dc + x, r + dr + y))) return false;
    return true;
  });
  /** Start overlapping the anchor and step outward one cell at a time until the grid fits with one empty cell around it. */
  const slide = (grid: string, start: Cell, step: Cell): Cell => {
    let offset = start;
    while (!clear(grid, offset)) offset = [offset[0] + step[0], offset[1] + step[1]];
    return offset;
  };
  const bounds = () => {
    const cells = [...occupied.keys()].map(k => k.split(",").map(Number));
    return {
      minC: Math.min(...cells.map(c => c[0])), maxC: Math.max(...cells.map(c => c[0])),
      minR: Math.min(...cells.map(c => c[1])), maxR: Math.max(...cells.map(c => c[1])),
    };
  };
  /** Cheapest orthogonal path: empty cells first, crossing a connector line before ever crossing a picture. */
  const route = (from: Cell, to: Cell): Cell[] | undefined => {
    const b = bounds(), minC = b.minC - 3, maxC = b.maxC + 3, minR = b.minR - 3, maxR = b.maxR + 3;
    const cols = maxC - minC + 1, size = cols * (maxR - minR + 1);
    const index = (c: number, r: number, d: number) => (((r - minR) * cols + (c - minC)) * 4) + d;
    const cost = new Float64Array(size * 4).fill(Infinity), back = new Int32Array(size * 4).fill(-1);
    const heap: [number, number][] = [];
    const push = (item: [number, number]) => {
      heap.push(item);
      for (let i = heap.length - 1; i > 0;) {
        const parent = (i - 1) >> 1;
        if (heap[parent][0] <= heap[i][0]) break;
        [heap[parent], heap[i]] = [heap[i], heap[parent]]; i = parent;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    for (let d = 0; d < 4; d++) { cost[index(from[0], from[1], d)] = 0; push([0, index(from[0], from[1], d)]); }
    let end = -1;
    while (heap.length) {
      const [spent, state] = pop();
      if (spent > cost[state]) continue;
      const d = state % 4, cell = Math.floor(state / 4), c = cell % cols + minC, r = Math.floor(cell / cols) + minR;
      if (c === to[0] && r === to[1]) { end = state; break; }
      for (const [nd, [dx, dy]] of directions.entries()) {
        const nc = c + dx, nr = r + dy;
        if (nc < minC || nc > maxC || nr < minR || nr > maxR) continue;
        const here = nc === to[0] && nr === to[1] ? undefined : occupied.get(key(nc, nr));
        const step = 1 + (here === "icon" ? CROSS_NODE : here === "line" ? CROSS_LINE : 0) + (nd === d || (c === from[0] && r === from[1]) ? 0 : TURN);
        const next = index(nc, nr, nd);
        if (spent + step < cost[next]) { cost[next] = spent + step; back[next] = state; push([cost[next], next]); }
      }
    }
    if (end < 0) return undefined;
    const path: Cell[] = [];
    for (let state = end; state >= 0; state = back[state]) {
      const cell = Math.floor(state / 4), point: Cell = [cell % cols + minC, Math.floor(cell / cols) + minR];
      if (!path.length || path[0][0] !== point[0] || path[0][1] !== point[1]) path.unshift(point);
    }
    return path;
  };
  const corners = (path: readonly Cell[]) => path.filter((point, i) => {
    if (i === 0 || i === path.length - 1) return true;
    const [a, b] = [path[i - 1], path[i + 1]];
    return (a[0] === point[0]) !== (b[0] === point[0]);
  });
  const routeCost = (path: readonly Cell[]) => path.slice(1, -1).reduce((sum, [c, r]) => {
    const here = occupied.get(key(c, r));
    return sum + 1 + (here === "icon" ? CROSS_NODE : here === "line" ? CROSS_LINE : 0);
  }, 0) + (corners(path).length - 2) * TURN;

  place(BPH_DEFAULT_GRID, [0, 0]);
  const home = byGrid.get(BPH_DEFAULT_GRID) ?? [];
  const links: { from: BphPlacement; to: BphPlacement; path: Cell[] }[] = [];
  const entries = BPH_UPGRADE_GRIDS.filter(grid => grid.id !== BPH_DEFAULT_GRID).map(grid => ({
    grid: grid.id,
    entrance: home.find(p => BPH_UPGRADE_NODES[p.nodeId!].refs.riftSkillTreeGrid === grid.id),
    start: (byGrid.get(grid.id) ?? []).find(p => p.start),
    size: (byGrid.get(grid.id) ?? []).length,
  }));
  // Grids with an entrance go first, largest first, so the small ones fill the space that is left.
  for (const entry of entries.filter(e => e.entrance && e.start).sort((a, b) => b.size - a.size)) {
    const entrance = at(entry.entrance!), start = local(entry.start!);
    const anchor: Cell = [entrance[0] - start[0], entrance[1] - start[1]];
    let best: { offset: Cell; path: Cell[]; score: number } | undefined;
    for (const step of directions) {
      const offset = slide(entry.grid, anchor, step);
      place(entry.grid, offset);
      const path = route(entrance, [start[0] + offset[0], start[1] + offset[1]]);
      for (const p of byGrid.get(entry.grid) ?? []) occupied.delete(key(local(p)[0] + offset[0], local(p)[1] + offset[1]));
      if (!path) continue;
      const score = routeCost(path);
      if (!best || score < best.score) best = { offset, path, score };
    }
    if (!best) continue;
    place(entry.grid, best.offset);
    // Re-route against the final map, then reserve the path so later grids keep clear of it.
    const path = route(entrance, [start[0] + best.offset[0], start[1] + best.offset[1]]) ?? best.path;
    for (const [c, r] of path.slice(1, -1)) if (!occupied.has(key(c, r))) occupied.set(key(c, r), "line");
    links.push({ from: entry.entrance!, to: entry.start!, path: corners(path) });
  }
  // Grids without an entrance in the home tree sit beside its top rows: the first on the left, the next on the right.
  const top = Math.min(...home.map(p => local(p)[1]));
  for (const [i, entry] of entries.filter(e => !e.entrance || !e.start).entries()) {
    const cells = (byGrid.get(entry.grid) ?? []).map(local);
    if (!cells.length) continue;
    const centre = (Math.max(...home.map(p => p.x)) + Math.min(...home.map(p => p.x))) / 2;
    const ownCentre = (Math.max(...cells.map(c => c[0])) + Math.min(...cells.map(c => c[0]))) / 2;
    const anchor: Cell = [Math.round(centre - ownCentre), top - Math.min(...cells.map(c => c[1]))];
    place(entry.grid, slide(entry.grid, anchor, i % 2 ? [1, 0] : [-1, 0]));
  }
  const b = bounds();
  const shift = (c: number, r: number): Cell => [c - b.minC + MARGIN, r - b.minR + MARGIN];
  return {
    width: b.maxC - b.minC + 1 + MARGIN * 2,
    height: b.maxR - b.minR + 1 + MARGIN * 2,
    cell: p => offsets.has(p.gridId) ? shift(...at(p)) : [0, 0],
    links: links.map(link => ({ ...link, path: link.path.map(([c, r]) => shift(c, r)) })),
  };
}
