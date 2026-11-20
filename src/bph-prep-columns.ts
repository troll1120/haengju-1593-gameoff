type Vertex = { face: { id: string }; parents: ReadonlySet<string> };
export const PREP_STEP = 98, PREP_HEIGHT = 70, PREP_PITCH = 100;

/** Reserve a parent's own column until its last child. An intervening node can
 * never cover that stem. All lateral movement then fits in the gap above the child. */
export function prepColumns<T extends Vertex>(nodes: readonly T[]) {
  const index = new Map(nodes.map((n, i) => [n.face.id, i]));
  const parents = nodes.map(n => [...n.parents].map(id => index.get(id)!));
  const last = nodes.map((_, i) => i);
  parents.forEach((ps, i) => ps.forEach(p => { last[p] = i; }));
  function pack(width: number) {
    const rows: number[][] = [];
    let live: number[] = [];
    for (let start = 0; start < nodes.length;) {
      let end = Math.min(start + 3, nodes.length);
      while (end > start && (live.filter(p => last[p] >= end).length + end - start > width
        || parents.slice(start, end).some(ps => ps.some(p => p >= start)))) end--;
      if (end === start) return;
      const group = Array.from({length: end - start}, (_, i) => start + i);
      rows.push(group);
      live = [...live, ...group].filter(p => last[p] >= end);
      start = end;
    }
    return rows;
  }
  let width = 3, rows = pack(width);
  while (!rows) rows = pack(++width);
  const slots = Array.from({length: width}, (_, col) => col);
  let states = [{ cols: [] as number[], cost: 0 }];
  for (const group of rows) {
    const end = group[group.length - 1];
    const carry = last.slice(0, group[0]).flatMap((l, i) => l > end ? [i] : []);
    const future = [...carry, ...group.filter(i => last[i] > end)];
    const next = new Map<string, typeof states[number]>();
    for (const state of states) {
      const cols = state.cols.slice();
      const reserve = carry.map(p => cols[p]);
      const assign = (at: number, free: number[]) => {
        if (at < group.length) {
          for (const col of free) {
            cols[group[at]] = col;
            assign(at + 1, free.filter(c => c !== col));
          }
          return;
        }
        const links = [...reserve.map(c => [c, c]), ...group.flatMap(i => parents[i].map(p => [cols[p], cols[i]]))];
        let cost = state.cost;
        for (const [i, [a, b]] of links.entries()) {
          cost += Math.abs(a - b) + 20 * Math.max(0, Math.abs(a - b) - 1);
          for (let j = 0; j < i; j++) if ((links[j][0] - a) * (links[j][1] - b) < 0) cost += 1000;
        }
        // Centre a solitary root; keep independent siblings in reading order on ties.
        group.forEach((id, i) => {
          cost += .02 * Math.abs(cols[id] - (width - 1) / 2);
          if (i && cols[id] < cols[group[i - 1]]) cost += .01;
        });
        const key = future.map(id => cols[id]).join(",");
        if (!next.has(key) || cost < next.get(key)!.cost) next.set(key, {cols: cols.slice(), cost});
      };
      assign(0, slots.filter(c => !reserve.includes(c)));
    }
    // Broader frontiers can share many equivalent histories. Keep input responsive.
    states = [...next.values()].sort((a, b) => a.cost - b.cost).slice(0, 24);
  }
  return rows.flatMap((group, row) => group.map(i =>
    ({...nodes[i], row, x: (states[0].cols[i] + .5) * PREP_PITCH, columns: width})));
}

export function prepLinkPoints(p: {x:number; row:number}, n: {x:number; row:number}): [number, number][] {
  const bottom = p.row * PREP_STEP + PREP_HEIGHT, top = n.row * PREP_STEP;
  const points: [number, number][] = [[p.x, bottom]];
  if (p.x !== n.x && n.row > p.row + 1) points.push([p.x, top - (PREP_STEP - PREP_HEIGHT)]);
  points.push([n.x, top]);
  return points;
}
