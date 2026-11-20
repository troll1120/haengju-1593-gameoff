import { language, t, tr } from "./i18n";
import type { BphDrawResult, BphEffect, BphResource, BphSave } from "./bph-contract";
import type { Run } from "./rules";
import { BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { BPH_GENERALS, bphGeneralProgress } from "./bph-commanders";
import type { BphGeneral, BphMilestones } from "./bph-commanders";
import { generalPortrait } from "./roster";
import { BPH_CODEX_GROUPS } from "./bph-codex-groups";
import { renderBphCommanderInfo } from "./bph-commander-info";
import { restockBphRecruit } from "./bph-supply";
import { bphRecruitOfferPrice, bphUnitPack, buyBphRecruit } from "./bph-recruit";
import { BPH_RESOURCE_LABELS } from "./bph-upgrades";
import { bphRerollPrice, rerollBphShop } from "./bph-shop";
import { bphEffectValue, bphReelFrame } from "./bph";
import { bphShopEffects, hasBphShopEffects } from "./bph-shop-session";
import { acknowledgeBphResult, bphDiscoveryName } from "./bph-save";
import { hitBphPack } from "./bph-combat";
import { BPH_CLASS_ART } from "./bph-art";
import { HEIGHT, WIDTH } from "./geometry";
import { soldierArt } from "./card-art";
import { pixelIcon } from "./icons";
import { closePanel } from "./panel-motion";
import { feedbackChannels } from "./presentation";
import { skillGrowthLine } from "./skill-growth-view";
import "./bph.css";

type PanelContext = { readonly save: BphSave; readonly general: BphGeneral; readonly milestones: BphMilestones; readonly onChange: () => void; readonly onClose: () => void };
type Panel = (host: HTMLElement, context: PanelContext) => (() => void) | Promise<() => void>;
export type BphPanels = { readonly upgrades?: Panel; readonly relics?: Panel };
const button = (label: string, click: () => void): HTMLButtonElement => {
  const element = document.createElement("button");
  element.textContent = t(label); element.addEventListener("click", click); return element;
};
export function bphBackButton(click: () => void): HTMLButtonElement {
  const element = document.createElement("button"), picture = document.createElement("img"), label = document.createElement("span");
  element.type = "button"; element.className = "bph-back";
  picture.src = pixelIcon("back"); picture.alt = ""; label.textContent = t("돌아가기");
  element.append(picture, label); element.addEventListener("click", click);
  return element;
}
export function bphCodexUnread(save: BphSave): number {
  return BPH_CODEX_GROUPS.filter(group => group.variants.some(slot =>
    save.discovered.includes(slot.id) && !save.seen.includes(slot.id))).length;
}
export function mountBphCodexEntry(menu: HTMLElement, open: () => void): (save: BphSave) => void {
  const entry = document.createElement("button"), picture = document.createElement("img");
  const label = document.createElement("b"), count = document.createElement("small");
  entry.id = "codex-open"; entry.type = "button"; entry.className = "menu-button";
  picture.src = "./art/icons/tome-book-svg.webp"; picture.alt = "";
  label.dataset.ko = "도감"; label.textContent = t("도감");
  count.className = "bph-codex-news"; count.hidden = true;
  entry.append(picture, label, count); entry.addEventListener("click", open);
  menu.classList.add("has-codex"); menu.insertBefore(entry, menu.lastElementChild);
  return save => {
    const unread = bphCodexUnread(save);
    entry.classList.toggle("ready", unread > 0); count.hidden = unread === 0; count.textContent = String(unread);
  };
}
/** Spin length and the hold after landing; both cosmetic, the receipt was drawn by combat. */
export const BPH_REVEAL = { spinSeconds: .8, cells: 12, holdMs: 1200 } as const;
/** The deterministic reel: pool order repeated, phased so the cell after the last one is the drawn card. */
export function bphRevealReel(result: BphDrawResult): { readonly order: readonly string[]; readonly start: number; readonly counts: readonly number[]; readonly countStart: number } {
  const pool = BPH_PACKS[result.packId]?.pool.map(item => item.id).filter(id => BPH_PROFILES[id] || BPH_TOMES[id]) ?? [];
  const drawn = result.cards[0].profileId, order = pool.includes(drawn) ? pool : [...pool, drawn];
  const start = ((order.indexOf(drawn) - BPH_REVEAL.cells) % order.length + order.length) % order.length;
  const landed = result.multiplier ?? 1;
  const counts = Array.from({ length: Math.max(5, landed) }, (_, index) => index + 1);
  const countStart = ((landed - 1 - BPH_REVEAL.cells) % counts.length + counts.length) % counts.length;
  return { order, start, counts, countStart };
}
/** "×5" normally; "×5 → +12" if fewer copies spawned than the roll promised, so the number shown is what spawned. */
export function bphRevealCount(result: BphDrawResult): string {
  const multiplier = result.multiplier ?? 1, wanted = result.cards.reduce((sum, card) => sum + card.copies, 0) * multiplier;
  return result.spawned !== undefined && result.spawned < wanted ? `×${multiplier} → +${result.spawned}` : `×${multiplier}`;
}
/** First discovery of the drawn card: the codex entry was new at this draw, with the authored discovery reward. */
export function bphRevealDiscovery(result: BphDrawResult): { readonly isNew: boolean; readonly bonus: number; readonly resource: BphResource | null } {
  const primary = result.cards[0], card = BPH_PROFILES[primary.profileId] ?? BPH_TOMES[primary.profileId];
  return { isNew: primary.discovered, bonus: card?.discoveryBonus ?? 0, resource: card?.discoveryResource ?? null };
}
function revealArt(profileId: string): string {
  const profile = BPH_PROFILES[profileId];
  return profile ? soldierArt(BPH_CLASS_ART[profile.classId]) : `<img class="bph-reveal-tome" src="./art/icons/tome-book-svg.webp" alt="">`;
}
export function renderBphShop(host: HTMLElement, context: {
  readonly save: BphSave; readonly effects: () => readonly BphEffect[]; readonly panels: BphPanels;
  readonly milestones: BphMilestones;
  readonly general: BphGeneral; readonly onSave: () => void;
  readonly onStart: (general: BphGeneral) => void; readonly onClose: () => void;
  /** The tab the screen opens on, for a shortcut that lands in one. */
  readonly open?: keyof BphPanels;
}): () => void {
  const { save } = context;
  let general = context.general, disposePanel: (() => void) | undefined;
  const shell = document.createElement("section"); shell.className = "bph-management panel";
  const header = document.createElement("header"), heading = document.createElement("h1");
  heading.textContent = t("출전 준비"); header.append(heading, bphBackButton(context.onClose));
  const body = document.createElement("div"); body.className = "bph-management-body";
  const balance = document.createElement("p"); balance.className = "bph-balance"; balance.setAttribute("aria-live", "polite");
  const label = document.createElement("div"); label.className = "bph-commanders";
  const condition = document.createElement("p"); condition.className = "bph-general-condition"; condition.hidden = true;
  const growth = document.createElement("p"); growth.className = "skill-growth-line"; growth.setAttribute("aria-live", "polite");
  const info = document.createElement("div"); info.className = "bph-commander-detail"; info.append(renderBphCommanderInfo(general));
  for (const name of BPH_GENERALS) {
    const unlocked = save.unlockedGenerals.includes(name);
    const option = button("", () => {
      if (unlocked) {
        general = name; condition.hidden = true;
        growth.textContent = skillGrowthLine(general, context.effects());
        info.replaceChildren(renderBphCommanderInfo(name));
        label.querySelectorAll("button").forEach(entry => entry.setAttribute("aria-pressed", String(entry === option)));
      } else {
        condition.textContent = t(tr`${name} · ${bphGeneralProgress(save, context.milestones, name)?.label ?? "미해금"}`);
        condition.hidden = false;
      }
    });
    option.className = unlocked ? "bph-commander" : "bph-commander locked";
    option.setAttribute("aria-label", t(tr`${name}${unlocked ? " 선택" : " 해금 조건"}`));
    option.setAttribute("aria-pressed", String(name === general));
    const image = document.createElement("img");
    image.src = `./art/portraits/${generalPortrait(name)}.png`; image.alt = "";
    option.append(image);
    if (unlocked) { const caption = document.createElement("span"); caption.textContent = t(name); option.append(caption); }
    label.append(option);
  }
  const actions = document.createElement("nav"), side = document.createElement("div");
  const pending = document.createElement("div");
  if (save.pendingResults.length) {
    const received = document.createElement("p");
    received.textContent = tr`이전 개봉 기록: ${save.pendingResults.flatMap(result => result.cards.map(card => t(bphDiscoveryName(card.profileId)))).join(", ")}`;
    pending.append(received, button("개봉 기록 확인", () => {
      for (const result of [...save.pendingResults]) acknowledgeBphResult(save, result.id);
      context.onSave(); pending.replaceChildren();
    }));
  }
  side.className = "bph-side"; actions.className = "bph-actions";
  const redraw = () => {
    growth.textContent = skillGrowthLine(general, context.effects());
    balance.innerHTML = tr`<span><img src="${pixelIcon("mastery")}" alt="강화 포인트"> ${Math.floor(save.resources.mastery)}</span><span><img src="${pixelIcon("foil")}" alt="금박"> ${save.resources.foilium}</span>`;
    const shop = hasBphShopEffects(context.effects()) && save.shop?.managementVisit === save.lifecycle.managementVisit
      ? save.shop : undefined;
    reroll.hidden = !shop || bphEffectValue(context.effects(), "ShopCanBeRerolled") <= 0;
    if (shop) {
      const price = bphRerollPrice(shop, bphShopEffects(context.effects()));
      reroll.textContent = `${language() === "en" ? "Reroll shop" : "상점 갱신"} · ${price}`;
      reroll.disabled = save.coins < price;
      const coins = document.createElement("span");
      coins.innerHTML = `<img src="${pixelIcon("coin")}" alt="${language() === "en" ? "Coins" : "코인"}"> ${save.coins}`;
      balance.append(coins);
    }
  };
  const reroll = button("", () => {
    if (!hasBphShopEffects(context.effects())) return;
    const shop = save.shop;
    if (shop && rerollBphShop(save, shop, bphShopEffects(context.effects()))) { context.onSave(); redraw(); }
  });
  reroll.dataset.bphReroll = "true";
  let panelRequest = 0, openTab: HTMLButtonElement | undefined;
  const closeSide = () => {
    const closing = disposePanel, request = ++panelRequest;
    disposePanel = undefined;
    openTab?.setAttribute("aria-pressed", "false"); openTab = undefined;
    closePanel(side, () => {
      closing?.();
      if (request === panelRequest) { side.replaceChildren(); body.scrollTop = 0; }
      side.inert = false;
    });
  };
  for (const [key, text] of [["upgrades", "강화망"], ["relics", "유물"]] as const) {
    const render = context.panels[key];
    if (!render) continue;
    // The open tab is its panel's title and its close control: a second tap folds the panel away.
    const tab = button(text, async () => {
      if (openTab === tab) { closeSide(); return; }
      const request = ++panelRequest;
      disposePanel?.(); side.replaceChildren();
      openTab?.setAttribute("aria-pressed", "false"); openTab = tab; tab.setAttribute("aria-pressed", "true");
      side.textContent = t("불러오는 중…");
      const panel = document.createElement("div");
      const dispose = await render(panel, { save, general, milestones: context.milestones, onChange: () => { context.onSave(); redraw(); },
        onClose: closeSide });
      if (request !== panelRequest) { dispose(); return; }
      side.replaceChildren(...Array.from(panel.childNodes)); disposePanel = dispose;
      body.scrollTop = 0;
    });
    tab.setAttribute("aria-pressed", "false"); tab.dataset.bphTab = key;
    actions.append(tab);
  }
  actions.append(reroll);
  const footer = document.createElement("footer"), start = button("출전", () => context.onStart(general));
  start.className = "menu-button primary"; start.dataset.bphStart = "true";
  body.append(balance, label, condition, growth, pending, actions, info, side); footer.append(start);
  shell.append(header, body, footer); host.replaceChildren(shell); host.hidden = false; redraw();
  if (context.open) actions.querySelector<HTMLButtonElement>(`[data-bph-tab="${context.open}"]`)?.click();
  return () => { panelRequest++; closePanel(shell, () => { disposePanel?.(); shell.remove(); }); };
}
export function renderBphField(host: HTMLElement, run: Run, onSave: () => void): () => void {
  const battle = run.bph;
  if (!battle) return () => { host.replaceChildren(); };
  const layer = document.createElement("div"); layer.className = "bph-field";
  const shop = restockBphRecruit(run);
  const recruitmentArt = pixelIcon("reinforce"), coinArt = pixelIcon("coin"), supplyArt = pixelIcon("supply");
  let offerLabel = "";
  const recruit = button("", () => {
    restockBphRecruit(run);
    const slot = shop.offers.findIndex(offer => !offer.sold);
    if (slot < 0) return;
    const acquired = buyBphRecruit(run, shop, slot);
    if (!acquired) return;
    battle.packs.push({ ...acquired, hp: 1, x: WIDTH / 2, y: HEIGHT / 2 + 70 });
    hitBphPack(run, acquired.id);
    onSave();
  });
  recruit.className = "bph-recruit-button";
  const packs = document.createElement("div"), receipt = document.createElement("div");
  receipt.className = "bph-receipt"; receipt.hidden = true; receipt.setAttribute("aria-live", "polite");
  const caption = document.createElement("strong"), art = document.createElement("span"), reward = document.createElement("small");
  art.className = "bph-reveal-art"; caption.className = "bph-reveal-name"; reward.className = "bph-reveal-reward"; reward.hidden = true;
  receipt.append(art, caption, reward); layer.append(packs, receipt, recruit); host.replaceChildren(layer); host.hidden = false;
  let current = -1, startedAt = 0, skipped = false, displayed = "", closing = false, landedAt = 0;
  let reel = { order: [] as readonly string[], start: 0, counts: [] as readonly number[], countStart: 0 }, unitPack = false;
  // The reveal never takes pointer events: a tap anywhere lands or dismisses it and still reaches the field.
  const tap = () => {
    if (!layer.isConnected) { document.removeEventListener("pointerdown", tap, true); return; }
    if (!receipt.hidden && !closing) skipped = true;
  };
  document.addEventListener("pointerdown", tap, true);
  const packButtons = new Map<number, HTMLButtonElement>();
  return () => {
    if (run.phase !== "playing") { layer.hidden = true; return; }
    restockBphRecruit(run);
    const offer = shop.offers.find(offer => !offer.sold);
    const price = bphRecruitOfferPrice(run, shop);
    const nextLabel = `${language()}:${offer?.packId ?? ""}:${offer?.box}:${price}`;
    if (offerLabel !== nextLabel) {
      offerLabel = nextLabel;
      recruit.innerHTML = tr`<img src="${recruitmentArt}" alt="">병력 모집${offer?.box ? tr` 묶음 ${BPH_PACKS[offer.packId].boxCount}회` : ""} <img src="${coinArt}" alt="코인">${price}`;
    }
    recruit.disabled = !offer || run.gold < price;
    for (const pack of battle.packs) {
      let target = packButtons.get(pack.id);
      if (!target) {
        target = button("병력 모집", () => { hitBphPack(run, pack.id); onSave(); });
        target.className = "bph-field-pack"; target.dataset.bphPack = String(pack.id);
        target.innerHTML = tr`<img src="${supplyArt}" alt="모집 보급 꾸러미">`;
        packButtons.set(pack.id, target); packs.append(target);
      }
      target.setAttribute("aria-label", t(tr`병력 모집 꾸러미 ${pack.hp}/2`));
      target.style.left = `${pack.x / WIDTH * 100}%`; target.style.top = `${pack.y / HEIGHT * 100}%`;
    }
    for (const [id, target] of packButtons) if (!battle.packs.some(pack => pack.id === id)) { target.remove(); packButtons.delete(id); }
    const result = battle.receipts[0];
    if (!result) { receipt.hidden = true; return; }
    if (current !== result.id) {
      current = result.id; startedAt = performance.now(); skipped = false; displayed = ""; closing = false; landedAt = 0;
      reel = bphRevealReel(result); unitPack = bphUnitPack(result.packId);
      receipt.classList.remove("bph-landed", "bph-rare", "bph-closing");
    }
    const channels = feedbackChannels(document.querySelector("#toggle-motion")?.getAttribute("aria-pressed") === "true",
      document.querySelector("#toggle-flashes")?.getAttribute("aria-pressed") === "true", matchMedia("(prefers-reduced-motion: reduce)").matches);
    receipt.classList.toggle("still", !channels.motion); receipt.classList.toggle("quiet", !channels.flash);
    if (closing) return;
    const elapsed = (performance.now() - startedAt) / 1000;
    const frame = bphReelFrame(result, elapsed, { seconds: BPH_REVEAL.spinSeconds, cells: BPH_REVEAL.cells,
      skipped: skipped || !channels.motion || landedAt > 0 });
    const primary = result.cards[0];
    const shown = frame.done ? primary.profileId : reel.order[(reel.start + frame.index) % reel.order.length];
    const number = frame.done ? bphRevealCount(result) : `×${reel.counts[(reel.countStart + frame.index) % reel.counts.length]}`;
    const key = `${language()}:${result.id}:${frame.done ? "done" : frame.index}`;
    if (displayed !== key) {
      displayed = key;
      const found = bphRevealDiscovery(result), isNew = frame.done && found.isNew;
      caption.textContent = t(bphDiscoveryName(shown));
      art.innerHTML = revealArt(shown) + (unitPack ? `<b class="bph-reveal-count">${number}</b>` : "")
        + (isNew ? `<b class="bph-reveal-new">${t("새 발견!")}</b>` : "");
      reward.hidden = !(isNew && found.bonus > 0 && found.resource);
      reward.textContent = reward.hidden ? "" : `${t(BPH_RESOURCE_LABELS[found.resource!])} +${found.bonus}`;
    }
    if (frame.done && !landedAt) { landedAt = performance.now(); skipped = false; }
    receipt.classList.toggle("bph-spinning", !frame.done); receipt.hidden = false;
    receipt.classList.toggle("bph-rare", frame.done && primary.foil);
    receipt.classList.toggle("bph-landed", frame.done);
    if (frame.done && (skipped || performance.now() - landedAt >= BPH_REVEAL.holdMs)) {
      closing = true; receipt.classList.add("bph-closing");
      const finish = () => {
        acknowledgeBphResult(battle.save, result.id); battle.receipts.shift(); receipt.hidden = true; onSave();
      };
      void Promise.all(receipt.getAnimations().map(animation => animation.finished)).then(finish, finish);
    }
  };
}
