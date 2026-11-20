import { t, tr } from "./i18n";
import type { BphSave } from "./bph-contract";
import { BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import type { BphPlacement, BphUpgradeNode } from "./bph-upgrade-data";
import { adjacentBphPlacements, visibleBphPlacements, BPH_RESOURCE_LABELS, BPH_PLACEMENTS, BPH_UPGRADE_GRIDS, BPH_UPGRADE_NODES, bphNodeBlockers, bphNodeCost, buyBphNode } from "./bph-upgrades";
import { bphReachabilityTargets } from "./bph-reachability-targets";
import { bphGoalSummary, bphSelectedNote, bphTargetLabel, bphTargetRows, bphTileState, bphTileStateWord, bphWalletAmount } from "./bph-upgrade-reach-view";
import { pixelIcon } from "./icons";
import { closePanel } from "./panel-motion";
import type { IconName } from "./icons";
import { upgradeDescription, upgradeFace, upgradeName, upgradeRank, upgradeRankPips, upgradeRankText } from "./bph-upgrade-presentation";
import "./bph-upgrades.css";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { activeBphEffects } from "./bph-upgrades";
import type { BphGeneral } from "./bph-commanders";
import { skillGrowthLine } from "./skill-growth-view";

const gridNames: Readonly<Record<string, string>> = {
  _SkillTreeMain_Demo: "행주 본진", _SkillTreePrestige1: "전초 진영",
  _SkillTreePrestige2: "후방 진영", _SkillTreeChaos: "화공 진지",
  _SkillTreeFrozen: "한강 나루", _SkillTreeGraveyard: "산성 지하", _SkillTreeNature: "의병 숲",
};
const resourceIcons = {
  mastery: "mastery", skull: "skull", coinIncome: "coin", zenith: "fame", ink: "military-order",
  fruit: "grain", foilium: "foil", shard: "shard", runeA: "sword", runeB: "shield",
  runeC: "crossbow", prestigePoint: "trophy", relic: "relic",
} as const satisfies Record<keyof typeof BPH_RESOURCE_LABELS, IconName>;
const isResource = (key: string): key is keyof typeof resourceIcons => Object.hasOwn(resourceIcons, key);
const label = upgradeName;
const text = (tag: string, content: string, className = "") => {
  const el = document.createElement(tag);
  el.textContent = t(content); el.className = className; return el;
};

/** Owns only its host subtree and listeners. CORE owns navigation and persistence. */
export function renderBphUpgrades(host: HTMLElement, context: {
  readonly save: BphSave; readonly general: BphGeneral; readonly onChange: () => void; readonly onClose: () => void;
}): () => void {
  const abort = new AbortController();
  let rendered = new AbortController();
  const grids = [...BPH_UPGRADE_GRIDS].sort((a, b) => Number(b.id === BPH_DEFAULT_GRID) - Number(a.id === BPH_DEFAULT_GRID));
  const targets = bphReachabilityTargets();
  // Only the view coordinates change. Every placement keeps its authored grid and ID.
  const zones = grids.map((grid, index) => ({
    grid, x: index === 0 ? 44 : index % 2 ? 2 : 96,
    y: index === 0 ? 2 : 2 + Math.floor((index - 1) / 2) * 44,
  }));
  const visible = () => grids.flatMap(grid => visibleBphPlacements(context.save, grid.id))
    .filter(p => p.nodeId && ![1, 2, 3].includes(BPH_UPGRADE_NODES[p.nodeId].type));
  const initial = visible();
  const recent = [...context.save.purchasedPlacements].reverse()
    .map(id => BPH_PLACEMENTS.get(id)).find(p => p && initial.some(v => v.id === p.id));
  let selected = recent ?? initial.find(p => bphNodeBlockers(context.save, p.id).length === 0) ?? initial[0];
  let cell = 64;
  let frame = 0;
  let map: HTMLElement;
  let showDescription = false;
  const point = (p: BphPlacement) => {
    const zone = zones.find(z => z.grid.id === p.gridId);
    return zone ? [(zone.x + p.x + .5) * cell, (zone.y + zone.grid.height - p.y + .5) * cell] : [0, 0];
  };
  const root = text("section", "", "bph-web");
  root.setAttribute("aria-label", t("병력 강화망"));
  host.replaceChildren(root);
  const button = (caption: string, action: () => void) => {
    const el = document.createElement("button");
    el.type = "button"; el.textContent = t(caption);
    el.addEventListener("click", action, { signal: rendered.signal }); return el;
  };
  const image = (name: IconName, alt: string) => {
    const img = document.createElement("img");
    img.src = pixelIcon(name); img.alt = t(alt);
    img.draggable = false;
    return img;
  };
  /** Whose upgrade it is, with what it changes in the corner. */
  const face = (node: BphUpgradeNode, alt: string) => {
    const look = upgradeFace(node), holder = text("span", "", "bph-web-face");
    const art = document.createElement("img");
    art.src = look.picture; art.alt = t(alt); art.draggable = false;
    const frame = text("span", "", `bph-web-art ${look.sheet ?? ""}`);
    frame.append(art); holder.append(frame);
    if (look.badge) {
      const badge = document.createElement("img");
      badge.src = look.badge; badge.alt = ""; badge.draggable = false; badge.className = "bph-web-badge";
      holder.append(badge);
    }
    return holder;
  };
  const center = (p: BphPlacement) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => map.scrollTo({
      left: point(p)[0] - map.clientWidth / 2,
      top: point(p)[1] - map.clientHeight / 2,
    }));
  };
  const draw = (recenter: boolean) => {
    const position = map ? [map.scrollLeft, map.scrollTop] : [0, 0];
    rendered.abort(); rendered = new AbortController();
    root.replaceChildren();
    const wallet = text("details", "", "bph-web-wallet");
    const current = text("summary", "");
    const goals = bphTargetRows(context.save, targets), core = goals.find(row => row.group === "core");
    current.append(image(resourceIcons.mastery, BPH_RESOURCE_LABELS.mastery), text("span", context.save.resources.mastery.toLocaleString("ko-KR")),
      image(resourceIcons.foilium, BPH_RESOURCE_LABELS.foilium), text("span", String(context.save.resources.foilium)));
    if (core) current.append(text("span", bphGoalSummary(core), "bph-web-goal"));
    wallet.append(current);
    const balances = text("div", "", "bph-web-balances");
    const resourceName = text("output", "재화를 누르면 이름 표시", "bph-web-resource-name");
    resourceName.setAttribute("aria-live", "polite");
    for (const resource of Object.keys(resourceIcons)) {
      if (!isResource(resource)) continue;
      const caption = BPH_RESOURCE_LABELS[resource];
      const amount = bphWalletAmount(context.save, resource).toLocaleString("ko-KR");
      const entry = button("", () => { resourceName.textContent = t(caption); });
      entry.className = "bph-web-balance";
      entry.dataset.resource = resource;
      entry.title = t(caption);
      entry.setAttribute("aria-label", t(tr`${caption} ${amount}`));
      entry.append(image(resourceIcons[resource], ""), text("span", amount));
      balances.append(entry);
    }
    const targetList = text("dl", "", "bph-web-targets");
    for (const row of goals) {
      const entry = text("div", ""); entry.dataset.target = row.group;
      entry.append(text("dt", bphTargetLabel(row.group)), text("dd", `${row.bought}/${row.total}`)); targetList.append(entry);
    }
    balances.append(resourceName, targetList);
    wallet.append(balances);
    current.addEventListener("click", event => {
      if (!wallet.hasAttribute("open")) return;
      event.preventDefault();
      if (balances.inert) return;
      closePanel(balances, () => { wallet.removeAttribute("open"); balances.inert = false; });
    }, { signal: rendered.signal });
    map = text("div", "", "bph-web-map");
    map.tabIndex = 0; map.setAttribute("aria-label", t("강화망. 스크롤 또는 방향키로 이동"));
    const canvas = text("div", "", "bph-web-canvas");
    const geometry: (() => void)[] = [];
    const width = Math.max(...zones.map(z => z.x + z.grid.width)) + 2;
    const height = Math.max(...zones.map(z => z.y + z.grid.height + 1)) + 2;
    geometry.push(() => { canvas.style.width = `${width * cell}px`; canvas.style.height = `${height * cell}px`; });
    for (const [index, zone] of zones.entries()) {
      const area = text("section", "", `bph-web-zone zone-${index}`);
      area.setAttribute("aria-label", t(gridNames[zone.grid.id]));
      area.dataset.grid = zone.grid.id;
      // The home zone carries no name tag: it is the tree every sortie opens on. The other zones keep theirs.
      if (zone.grid.id !== BPH_DEFAULT_GRID) area.append(text("h3", gridNames[zone.grid.id], "bph-web-zone-name"));
      geometry.push(() => {
        area.style.left = `${zone.x * cell}px`; area.style.top = `${zone.y * cell}px`;
        area.style.width = `${zone.grid.width * cell}px`; area.style.height = `${(zone.grid.height + 1) * cell}px`;
      });
      canvas.append(area);
    }
    const lines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    geometry.push(() => { lines.setAttribute("width", String(width * cell)); lines.setAttribute("height", String(height * cell)); });
    lines.setAttribute("aria-hidden", "true");
    const edgeTiles = document.createElementNS(lines.namespaceURI, "defs");
    const edgePattern = document.createElementNS(lines.namespaceURI, "pattern");
    const edgePatternId = `bph-web-edges-${crypto.randomUUID()}`;
    edgePattern.setAttribute("id", edgePatternId);
    edgePattern.setAttribute("patternUnits", "userSpaceOnUse");
    edgePattern.setAttribute("width", "4"); edgePattern.setAttribute("height", "8");
    edgePattern.setAttribute("viewBox", "14 12 4 8");
    const edgeImage = document.createElementNS(lines.namespaceURI, "image");
    edgeImage.setAttribute("href", "./art/icons/bph-web-edges.webp");
    edgeImage.setAttribute("width", "32"); edgeImage.setAttribute("height", "32");
    edgeImage.setAttribute("image-rendering", "pixelated");
    edgePattern.append(edgeImage); edgeTiles.append(edgePattern); lines.append(edgeTiles);
    const revealed = grids.flatMap(grid => visibleBphPlacements(context.save, grid.id, true));
    const visibleIds = new Set(revealed.map(p => p.id));
    for (const p of revealed) {
      for (const next of adjacentBphPlacements(p).filter(n => n.id > p.id && visibleIds.has(n.id))) {
        const edge = document.createElementNS(lines.namespaceURI, "line");
        const paint = document.createElementNS(lines.namespaceURI, "pattern");
        const paintId = `${edgePatternId}-${p.id}-${next.id}`;
        paint.setAttribute("id", paintId); paint.setAttribute("href", `#${edgePatternId}`);
        edge.setAttribute("stroke", `url(#${paintId})`); edgeTiles.append(paint);
        geometry.push(() => {
          const [x, y] = point(p), [toX, toY] = point(next);
          const length = Math.hypot(toX - x, toY - y), dx = (toX - x) / length, dy = (toY - y) / length;
          const border = (node: BphPlacement) => node.nodeId && ![1, 2, 3].includes(BPH_UPGRADE_NODES[node.nodeId].type)
            ? node.id === selected?.id ? 26 : 22 : 0;
          edge.setAttribute("x1", String(x + dx * border(p))); edge.setAttribute("y1", String(y + dy * border(p)));
          edge.setAttribute("x2", String(toX - dx * border(next))); edge.setAttribute("y2", String(toY - dy * border(next)));
          edge.setAttribute("data-from", p.id); edge.setAttribute("data-to", next.id);
          const angle = Math.atan2(toY - y, toX - x) * 180 / Math.PI;
          paint.setAttribute("patternTransform", `translate(${x} ${y}) rotate(${angle}) translate(0 -4)`);
        });
        lines.append(edge);
      }
    }
    canvas.append(lines);
    for (const p of revealed) {
      const node = p.nodeId ? BPH_UPGRADE_NODES[p.nodeId] : undefined;
      if (!node) continue;
      if ([1, 2, 3].includes(node.type)) continue;
      // Preserve path geometry without restoring a removed upgrade's identity or controls.
      if (BPH_HIDDEN_UPGRADES.has(node.id)) {
        const junction = text("span", "", "bph-web-junction");
        junction.inert = true; junction.setAttribute("aria-hidden", "true");
        junction.append(image("lock", ""));
        geometry.push(() => { junction.style.left = `${point(p)[0] - 22}px`; junction.style.top = `${point(p)[1] - 22}px`; });
        canvas.append(junction); continue;
      }
      const state = bphTileState(context.save, p);
      const tile = button("", () => { selected = p; showDescription = true; draw(false); });
      const rank = upgradeRank(context.save, p), pips = upgradeRankPips(rank);
      tile.append(face(node, ""));
      if (state === "bought") tile.append(text("span", "", "bph-web-check"));
      if (state === "passage") tile.append(text("span", "", "bph-web-gate"));
      if (pips) {
        const corner = text("span", /●|○/.test(pips) ? "" : pips, "bph-web-rank");
        if (!corner.textContent) for (const pip of pips) corner.append(text("i", "", pip === "●" ? "on" : ""));
        corner.dataset.rank = `${rank.bought}/${rank.max}`;
        tile.append(corner);
      }
      tile.className = `bph-web-node ${state} ${p.id === selected?.id ? "selected" : ""}`;
      tile.dataset.placement = p.id;
      geometry.push(() => { tile.style.left = `${point(p)[0] - 22}px`; tile.style.top = `${point(p)[1] - 22}px`; });
      const caption = t(tr`${label(node)} · ${bphTileStateWord(state)}`);
      tile.setAttribute("aria-label", caption);
      tile.setAttribute("aria-pressed", String(p.id === selected?.id));
      tile.title = state === "passage" ? caption : t(label(node)); canvas.append(tile);
    }
    map.append(canvas);
    geometry.forEach(update => update());
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = false;
    const changeZoom = (next: number, x: number, y: number) => {
      const previous = cell;
      cell = Math.max(52, Math.min(128, next));
      const left = (map.scrollLeft + x) / previous * cell - x;
      const top = (map.scrollTop + y) / previous * cell - y;
      geometry.forEach(update => update());
      map.scrollTo(left, top);
    };
    map.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      if (pointers.size === 0) moved = false;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }, { signal: rendered.signal });
    map.addEventListener("pointermove", event => {
      const before = pointers.get(event.pointerId);
      if (!before) return;
      const old = [...pointers.values()];
      const dx = event.clientX - before.x, dy = event.clientY - before.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      map.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const next = [...pointers.values()];
      if (old.length === 2) {
        const rect = map.getBoundingClientRect();
        const distance = (points: typeof old) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const x = (next[0].x + next[1].x) / 2 - rect.left, y = (next[0].y + next[1].y) / 2 - rect.top;
        map.scrollBy(-dx / 2, -dy / 2);
        if (distance(old) > 0) changeZoom(cell * distance(next) / distance(old), x, y);
      } else map.scrollBy(-dx, -dy);
    }, { signal: rendered.signal });
    const release = (event: PointerEvent) => { pointers.delete(event.pointerId); };
    map.addEventListener("pointerup", release, { signal: rendered.signal });
    map.addEventListener("pointercancel", release, { signal: rendered.signal });
    map.addEventListener("click", event => {
      if (moved) { event.preventDefault(); event.stopPropagation(); }
    }, { capture: true, signal: rendered.signal });
    map.addEventListener("wheel", event => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const rect = map.getBoundingClientRect();
      changeZoom(cell * Math.exp(-event.deltaY * .01), event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false, signal: rendered.signal });
    const detail = text("section", "", "bph-web-detail");
    detail.setAttribute("aria-label", t("선택한 강화"));
    const growth = text("p", skillGrowthLine(context.general, activeBphEffects(context.save)), "skill-growth-line");
    const node = selected?.nodeId ? BPH_UPGRADE_NODES[selected.nodeId] : undefined;
    if (node) {
      const info = document.createElement("details");
      info.open = showDescription;
      const summary = text("summary", "", "bph-web-effect");
      const description = upgradeDescription(node);
      const values = [...description.matchAll(/[+-]\d+(?:\.\d+)?(?:%|초|명|회|단계)?/g)].map(match => match[0]);
      const title = text("span", "", "bph-web-title");
      title.append(text("strong", label(node)));
      if (values.length) title.append(text("span", values.join(" · ")));
      summary.append(face(node, label(node)), title);
      summary.setAttribute("aria-label", t(tr`${label(node)}. ${description}. 상세 설명`));
      // Closed, the sheet is the name and its numbers. Opening it adds the full effect and the growth it feeds.
      const note = bphSelectedNote(context.save, selected, node);
      info.append(summary, ...(note ? [text("p", note, "bph-web-note")] : []), text("p", description, "bph-web-description"),
        text("p", upgradeRankText(upgradeRank(context.save, selected)), "bph-web-limit"), growth);
      detail.append(info);
      const costs = text("div", "", "bph-web-costs");
      for (const resource of Object.keys(resourceIcons)) {
        if (!isResource(resource)) continue;
        const cost = bphNodeCost(context.save, node, resource);
        if (cost <= 0) continue;
        const item = text("span", "", "bph-web-cost");
        item.append(image(resourceIcons[resource], BPH_RESOURCE_LABELS[resource]), text("span", cost.toLocaleString("ko-KR")));
        costs.append(item);
      }
      if (node.values.isChaos) costs.append(image("lock", "비용 미확인"));
      detail.append(costs);
      const blockers = bphNodeBlockers(context.save, selected.id);
      const purchase = button(node.type === 4 ? "보상 받기" : "강화 구입", () => {
        if (buyBphNode(context.save, selected.id)) { context.onChange(); draw(false); }
      });
      purchase.className = "bph-web-buy"; purchase.disabled = blockers.length > 0;
      if (blockers.length) {
        purchase.prepend(image(context.save.purchasedPlacements.includes(selected.id) ? "trophy" : "lock", ""));
        purchase.setAttribute("aria-label", t(tr`${purchase.textContent}. ${blockers.join(" · ")}`));
      }
      detail.append(purchase);
    } else detail.append(text("p", "원본 노드 참조 미확인"), growth);
    root.append(wallet, map, detail);
    if (recenter && selected) center(selected); else { map.scrollLeft = position[0]; map.scrollTop = position[1]; }
  };
  root.addEventListener("keydown", event => { if (event.key === "Escape") context.onClose(); }, { signal: abort.signal });
  window.addEventListener("resize", () => { if (selected) center(selected); }, { signal: abort.signal });
  draw(true);
  return () => { rendered.abort(); abort.abort(); cancelAnimationFrame(frame); root.remove(); };
}
