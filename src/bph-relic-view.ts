import { t } from "./i18n";
import type { BphSave } from "./bph-contract";
import { bphRelicEffect } from "./bph-relic-text";
import { BPH_SILHOUETTE_ART } from "./bph-locked-identity";
import { phrase } from "./bph-upgrade-effect-text";
import { bphRelicArt, bphRelicCards, bphRelicName, bphRelicSlotView, bphUnownedRelics, toggleBphRelic } from "./bph-relics";
import { claimBphRelic } from "./bph-account";
import { pixelIcon } from "./icons";
import { bphRelicTag } from "./bph-relic-tags";
import "./bph-upgrades.css";
import "./bph-relics.css";

export { bphRelicEffect } from "./bph-relic-text";
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function picture(src: string): HTMLImageElement {
  const image = el("img");
  image.src = src; image.alt = ""; image.draggable = false;
  return image;
}

export function renderBphRelics(host: HTMLElement, context: {
  readonly save: BphSave; readonly onChange: () => void; readonly onClose: () => void;
  readonly onEquip?: (relicId: string) => void;
}): () => void {
  const { save } = context, abort = new AbortController();
  const root = el("section", "bph-web bph-relics");
  root.setAttribute("aria-label", t("유물"));
  const status = el("p", "bph-relic-status", phrase("유물을 누르면 장착하거나 뺍니다", "Tap a relic to equip or remove it"));
  status.setAttribute("role", "status");
  host.replaceChildren(root);
  const toggle = (relicId: string) => {
    const before = [...save.relicState.equipped], name = bphRelicName(relicId), outcome = toggleBphRelic(save, relicId);
    const replaced = before.find(id => id !== relicId && !save.relicState.equipped.includes(id));
    status.textContent = outcome === "full"
      ? phrase("칸이 모두 찼습니다 · 위 칸을 눌러 먼저 빼세요", "All slots are full · Tap a slot above to remove a relic first")
      : outcome === "unequipped" ? phrase(`${name} 장착 해제`, `Removed ${name}`)
      : replaced ? phrase(`${name} 장착 · ${bphRelicName(replaced)} 해제`, `Equipped ${name} · removed ${bphRelicName(replaced)}`)
      : phrase(`${name} 장착`, `Equipped ${name}`);
    if (outcome === "equipped") context.onEquip?.(relicId);
    if (outcome !== "full") context.onChange();
    draw(relicId);
  };
  const draw = (focus?: string) => {
    const scroll = root.querySelector(".bph-relic-list")?.scrollTop ?? 0;
    const cards = bphRelicCards(save), slots = bphRelicSlotView(save), worn = save.relicState.equipped;
    const strip = el("div", "bph-relic-slots"), row = el("div", "bph-relic-slot-row");
    for (let index = 0; index < slots.open; index++) {
      const id = worn[index];
      if (id === undefined) {
        const empty = el("span", "bph-web-node available bph-relic-slot");
        empty.setAttribute("aria-hidden", "true"); row.append(empty); continue;
      }
      const slot = el("button", "bph-web-node bought bph-relic-slot");
      const label = phrase(`${bphRelicName(id)} 장착 해제`, `Remove ${bphRelicName(id)}`);
      slot.type = "button"; slot.title = label; slot.setAttribute("aria-label", label);
      slot.append(picture(bphRelicArt(id)));
      slot.addEventListener("click", () => toggle(id), { signal: abort.signal });
      row.append(slot);
    }
    for (let index = 0; index < slots.locked; index++) {
      const locked = el("span", "bph-web-node locked bph-relic-slot");
      locked.setAttribute("aria-hidden", "true"); locked.append(picture(pixelIcon("lock"))); row.append(locked);
    }
    strip.append(el("strong", "bph-relic-count", phrase(`장착 ${worn.length}/${slots.open}`, `Equipped ${worn.length}/${slots.open}`)), row);
    if (slots.locked) {
      const hint = el("p", "bph-relic-hint", phrase(`잠긴 ${slots.locked}칸 · 강화망`,
        `${slots.locked} locked · Upgrade web`));
      // A bought slot upgrade is claimed when the next battle starts, so the slot stays locked until then.
      hint.append(" · ", el("span", "bph-relic-note", phrase("다음 출전부터 열려요", "Opens next sortie")));
      strip.append(hint);
    }
    const list = el("div", "bph-relic-list");
    for (const card of cards) {
      const effect = bphRelicEffect(card.id), item = el("button", "bph-relic-card");
      const face = el("span", `bph-web-node ${card.equipped ? "bought" : "available"} bph-relic-face`), copy = el("span", "bph-relic-copy");
      face.append(picture(card.art));
      if (card.equipped) face.append(el("span", "bph-web-check"));
      // The relic's kind is one existing icon in the corner (sword: army, skill book: general), no words.
      const tag = picture(pixelIcon(bphRelicTag(card.id) === "general" ? "skill-up" : "sword"));
      tag.className = "bph-web-badge bph-relic-tag"; item.dataset.tag = bphRelicTag(card.id); face.append(tag);
      copy.append(el("strong", "", card.name), el("span", "", effect));
      item.type = "button"; item.dataset.relic = card.id;
      item.dataset.relicState = "owned";
      item.setAttribute("aria-pressed", String(card.equipped)); item.setAttribute("aria-label", `${card.name}. ${effect}`);
      item.append(face, copy);
      if (card.equipped) item.append(el("span", "bph-relic-state", phrase("장착 중", "Equipped")));
      item.addEventListener("click", () => toggle(card.id), { signal: abort.signal });
      list.append(item);
    }
    for (const {id, ready} of bphUnownedRelics(save)) {
      const slot = el("div", "bph-relic-mystery");
      slot.dataset.relicState = ready ? "claimable" : "unknown";
      slot.setAttribute("aria-label", ready ? phrase("획득 가능", "Ready to claim") : t("미발견"));
      slot.append(picture(BPH_SILHOUETTE_ART));
      if (ready) {
        const claim = el("button", "bph-relic-claim", phrase("획득", "Claim"));
        claim.type = "button"; claim.dataset.claimRelic = id;
        claim.onclick = () => {
          if (!claimBphRelic(save, id)) return;
          context.onChange();
          status.textContent = phrase(`${bphRelicName(id)} 획득`, `Claimed ${bphRelicName(id)}`);
          draw(id);
          root.querySelector(".bph-relic-list")?.scrollTo({top: 0});
        };
        slot.append(claim);
      }
      list.append(slot);
    }
    if (!cards.length) status.textContent = phrase("도감 병종을 완성하거나 강화망에서 유물을 발견하면 획득할 수 있어요",
      "Complete a codex class or discover a relic on the upgrade map to claim it here");
    root.replaceChildren(strip, list, status);
    list.scrollTop = scroll;
    if (focus) root.querySelector<HTMLElement>(`[data-relic="${CSS.escape(focus)}"]`)?.focus({ preventScroll: true });
  };
  root.addEventListener("keydown", event => { if (event.key === "Escape") context.onClose(); }, { signal: abort.signal });
  draw();
  return () => { abort.abort(); root.remove(); };
}
