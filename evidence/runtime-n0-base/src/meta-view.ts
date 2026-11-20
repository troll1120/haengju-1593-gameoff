import { t, tr } from "./i18n";
import { bonusesOf, buyNode, canBuy, keepMeta, META_NODES, nextUnlocks, visibleNode } from "./meta";
import type { Meta, MetaNode } from "./meta";
import type { Run } from "./rules";
import { pixelIcon } from "./icons";
import { GENERALS } from "./roster";
import { skillPicture, stars } from "./card-art";

const picture = (art: MetaNode["art"]) => typeof art === "string" ? `./art/${art}` : pixelIcon(art.icon);

/** Layout: one scrolling parchment, next unlocks above the keep and nine branches;
 * branch detail reuses that scroll owner, with the purchase strip last. */
export function treeView(root: HTMLElement, meta: Meta): () => void {
  let branch = "", selected = "", personal = "", list = false;
  const icon = (entry: MetaNode) => `<span class="node-art${typeof entry.art === "string" ? "" : ` pixel-icon pixel-${entry.art.icon}`}" style="background-image:url('${picture(entry.art)}')"></span>`;
  const state = (entry: MetaNode) => meta.nodes.includes(entry.id) ? "owned" : canBuy(meta, entry.id) ? "affordable"
    : entry.requires.every(id => meta.nodes.includes(id)) ? "short" : "locked";
  function grouped(entries: readonly MetaNode[]): MetaNode[] {
    const groups = [...new Set(entries.map(entry => entry.group))];
    return groups.flatMap(group => {
      const ranks = entries.filter(entry => entry.group === group);
      const next = ranks.find(entry => !meta.nodes.includes(entry.id)) ?? ranks.at(-1);
      return next ? [next] : [];
    });
  }
  const tile = (entry: MetaNode, large = false) => {
    const button = document.createElement("button");
    button.className = `tree-node ${state(entry)}${large ? " spine" : ""}`;
    button.dataset["node"] = entry.id; button.setAttribute("aria-pressed", String(selected === entry.id));
    const ranks = META_NODES.filter(node => node.group === entry.group);
    button.innerHTML = tr`${icon(entry)}<span class="node-copy"><strong>${entry.name}</strong><small>${entry.effect}</small></span>`
      + (ranks.length > 1 ? stars(ranks.filter(node => meta.nodes.includes(node.id)).length) : "")
      + tr`<span class="node-cost">${state(entry) === "locked" ? tr`<img src="${pixelIcon("lock")}" alt="잠김" /> ` : ""}${meta.nodes.includes(entry.id) ? "✓" : entry.cost}</span>`;
    button.addEventListener("click", () => { selected = entry.id; branch = entry.branch; render(); });
    return button;
  };
  function render(): void {
    const visible = META_NODES.filter(entry => visibleNode(meta, entry));
    const head = document.createElement("header"); head.className = "tree-heading";
    head.innerHTML = tr`<h1>${branch || "행주 성장 나무"}</h1><span><img src="${pixelIcon("merit")}" alt="군공" />${meta.merit}</span>`;
    const content = document.createElement("div"); content.className = list ? "tree-nodes list" : "tree-nodes";
    const nav = document.createElement("nav"); nav.className = "tree-nav";
    const back = document.createElement("button"); back.textContent = t("나무"); back.hidden = !branch;
    back.onclick = () => { if (personal) personal = selected = ""; else branch = selected = ""; render(); };
    const toggle = document.createElement("button"); toggle.textContent = t(list ? "나무 보기" : "목록 보기"); toggle.hidden = !branch;
    toggle.onclick = () => { list = !list; render(); };
    nav.append(back, toggle);
    if (!branch) {
      const generals = document.createElement("button"); generals.textContent = t("장수 수련");
      generals.onclick = () => { branch = "장수 수련"; render(); }; nav.append(generals);
    }
    const parts: HTMLElement[] = [head, nav];
    if (!branch) {
      const next = document.createElement("section"); next.className = "tree-next";
      next.innerHTML = t("<h2>다음 해금</h2>");
      for (const entry of nextUnlocks(meta)) next.append(tile(entry, true));
      const crown = document.createElement("button"); crown.className = "tree-keep";
      const level = meta.nodes.includes("keep7") ? 7 : meta.nodes.includes("keep6") ? 6 : meta.nodes.includes("keep5") ? 5 : bonusesOf(meta).caps?.party ?? 1;
      crown.innerHTML = tr`<img src="./art/icons/png-terrain_fort.webp" alt="" /><strong>본성 ${level}단계</strong>`;
      crown.onclick = () => { branch = "본성"; render(); };
      const branches = document.createElement("div"); branches.className = "tree-branches";
      for (const name of [...new Set(visible.map(entry => entry.branch))].filter(name => name !== "본성" && name !== "장수 수련")) {
        const entries = visible.filter(entry => entry.branch === name), first = entries[0];
        if (!first) continue;
        const button = document.createElement("button");
        button.className = `tree-branch${entries.some(entry => canBuy(meta, entry.id)) ? " affordable" : ""}`;
        const art: MetaNode["art"] = name === "보급" ? { icon: "supply" } : name === "성" ? "icons/png-terrain_wall.webp" : first.art;
        button.innerHTML = tr`${icon({ ...first, art })}<strong>${name}</strong><small>${entries.filter(entry => meta.nodes.includes(entry.id)).length}/${entries.length} · ${entries.filter(entry => canBuy(meta, entry.id)).length} 가능</small>`;
        button.onclick = () => { branch = name; render(); };
        branches.append(button);
      }
      parts.push(next, crown, branches);
    } else if (branch === "장수 수련" && !personal) {
      content.className = "tree-generals";
      for (const general of GENERALS) {
        const entry = META_NODES.find(node => node.id === `master-${general}`);
        if (!entry) continue;
        const button = document.createElement("button");
        button.className = `tree-general${GENERALS.indexOf(general) >= meta.unlocked ? " locked" : ""}`;
        button.innerHTML = tr`${icon(entry)}<strong>${general}</strong>`;
        button.onclick = () => { personal = general; render(); };
        content.append(button);
      }
      parts.push(content);
    } else {
      for (const entry of grouped(visible.filter(entry => entry.branch === branch && (!personal || entry.id.endsWith(`-${personal}`))))) content.append(tile(entry, entry.spine));
      parts.push(content);
      const entry = META_NODES.find(candidate => candidate.id === selected);
      if (entry) {
        const detail = document.createElement("section"); detail.className = "tree-detail";
        const rankText = entry.rank > 1 || META_NODES.some(node => node.group === entry.group && node.rank > 1)
          ? tr`<small>누적 ${entry.rank}칸 · ${entry.effect.includes("골드") ? tr`합산 +${entry.rank * 10}%` : tr`곱하기 ${entry.effect.includes("1.119") ? (1.119 ** entry.rank).toFixed(3) : entry.effect.includes("1.077") ? (1.077 ** entry.rank).toFixed(3) : (1.145 ** entry.rank).toFixed(3)}`}</small>` : "";
        detail.innerHTML = tr`${icon(entry)}<strong>${entry.name}</strong><p>${entry.effect}</p>${rankText}<small>${entry.requires.filter(id => !meta.nodes.includes(id)).map(id => t(META_NODES.find(node => node.id === id)?.name ?? "")).join(" · ")}</small>`;
        const purchase = document.createElement("button"); purchase.id = "tree-purchase";
        purchase.textContent = t(meta.nodes.includes(entry.id) ? "강화 완료" : tr`강화 · ${entry.cost}`);
        purchase.disabled = !canBuy(meta, entry.id);
        purchase.onclick = () => { if (buyNode(meta, entry.id)) { keepMeta(meta); render(); } };
        detail.append(purchase); parts.push(detail);
      }
    }
    root.replaceChildren(...parts);
    if (selected) root.querySelector(".tree-detail")?.scrollIntoView({ block: "nearest" });
  }
  return () => { branch = selected = personal = ""; render(); };
}

export function diagnosis(current: Run, meta: Meta): HTMLElement {
  const section = document.createElement("section"); section.className = "result-diagnosis";
  const record = document.createElement("div"); record.className = "record-track";
  record.setAttribute("aria-label", t("이번 기록·최고 기록·첫 성벽 붕괴"));
  record.innerHTML = tr`<div class="bar best"><i style="width:${Math.min(1, meta.bestSeconds / 600) * 100}%"></i></div><div class="bar"><i style="width:${Math.min(1, current.time / 600) * 100}%"></i></div>`
    + (current.metrics.firstBreach === null ? "" : tr`<img class="breach-mark" src="./art/props/wall_ew_a.png" alt="첫 성벽 붕괴" style="left:${current.metrics.firstBreach / 600 * 100}%" />`);
  section.append(record);
  const total = Object.values(current.metrics.classDamage).reduce((sum, value) => sum + value, 0);
  for (const [kind, amount] of Object.entries(current.metrics.classDamage).filter(([, value]) => value > 0)) {
    const image = kind === "general" ? "portraits/gwon_yul.png" : kind === "weapon" ? "icons/png-terrain_wall.webp" : `units/${kind}.png`;
    const row = document.createElement("div"); row.className = "damage-row";
    row.dataset["damage"] = String(amount);
    const art = kind === "skill" ? `<span class="node-art damage-skill">${skillPicture(current.commander)}</span>`
      : `<span class="node-art" style="background-image:url('./art/${image}')"></span>`;
    row.innerHTML = tr`${art}<div class="bar"><i style="width:${total ? amount / total * 100 : 0}%"></i></div>`;
    section.append(row);
  }
  const targets = document.createElement("div"); targets.className = "result-targets";
  targets.setAttribute("aria-label", t(tr`지금 구매 가능 ${META_NODES.filter(entry => canBuy(meta, entry.id)).length}개`));
  for (const entry of nextUnlocks(meta)) {
    const mark = document.createElement("span");
    mark.className = ["성", "보급"].includes(entry.branch) ? "defense" : entry.branch === "대장간" ? "strategy" : "attack";
    mark.innerHTML = tr`<span class="node-art${typeof entry.art === "string" ? "" : tr` pixel-icon pixel-${entry.art.icon}`}" style="background-image:url('${picture(entry.art)}')"></span><div class="bar"><i style="width:${Math.min(1, meta.merit / entry.cost) * 100}%"></i></div>`;
    targets.append(mark);
  }
  section.append(targets);
  return section;
}
