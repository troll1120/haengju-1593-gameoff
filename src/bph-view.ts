import { language, t, tr } from "./i18n";
import type { BphDrawResult, BphEffect, BphResource, BphSave } from "./bph-contract";
import type { Run } from "./rules";
import { BPH_CLASS_NAMES, BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { BPH_GENERALS, bphGeneralProgress } from "./bph-commanders";
import type { BphGeneral, BphMilestones } from "./bph-commanders";
import { bphHireSlots } from "./bph-join";
import { BPH_SILHOUETTE_ART, BPH_UNKNOWN_NAME } from "./bph-locked-identity";
import { generalPortrait } from "./roster";
import { BPH_CODEX_GROUPS } from "./bph-codex-groups";
import { bphDrawPool } from "./bph-tome-availability";
import { renderBphCommanderInfo } from "./bph-commander-info";
import { restockBphRecruit } from "./bph-supply";
import { bphRecruitAsk, bphUnitPack, buyBphRecruitPack } from "./bph-recruit";
import { BPH_RESOURCE_LABELS } from "./bph-upgrades";
import { bphMergedReward } from "./bph-cost-merge";
import type { BphKeptResource } from "./bph-cost-merge";
import { BPH_PACK_NAMES, bphRerollPrice, rerollBphShop } from "./bph-shop";
import { bphEffectValue, bphReelFrame } from "./bph";
import { bphShopEffects, hasBphShopEffects } from "./bph-shop-session";
import { acknowledgeBphResult, bphDiscoveryName } from "./bph-save";
import { BPH_ARRIVAL, BPH_CRATE, bphArrival, bphCrates, hitBphPack, skipBphArrivals, tapBphCrate } from "./bph-combat";
import { bphTacticCursor, bphTapStrike } from "./bph-fx-dispatch";
import { BPH_DISCOVERY_HITS, bphDiscoveryHolds, bphDiscoveryRay, bphDiscoveryStage, bphDiscoveryTag } from "./bph-discovery-reveal";
import type { BphCodexPicture } from "./bph-codex-page";
import { bphPrism } from "./bph-prism";
import type { BphArrival } from "./bph-combat";
import { BPH_CLASS_ART, bphProfileArt } from "./bph-art";
import { bphTomeArt } from "./bph-tome-art";
import type { BphShop } from "./bph-shop";
import { HEIGHT, WIDTH } from "./geometry";
import type { Point } from "./geometry";
import { buildings } from "./fortification";
import { soldierArt } from "./card-art";
import { pixelIcon } from "./icons";
import { closePanel } from "./panel-motion";
import { feedbackChannels } from "./presentation";
import { BPH_SMITHY, BPH_SMITHY_CLASSES, bphSmithyClassPrice, bphSmithyLevel, bphSmithyWallPrice, bphWallTier, bphWallTierCap,
  buyBphSmithyClass, buyBphSmithyWall } from "./bph-smithy";
import { skillPips } from "./skill-growth-view";
import { growthFor } from "./skill-growth";
import "./bph-codex.css";
import "./bph.css";
import "./result-screen.css";

type PanelContext = { readonly save: BphSave; readonly general: BphGeneral; readonly milestones: BphMilestones; readonly onChange: () => void; readonly onClose: () => void };
type UpgradePurchase = { readonly nodeId: string; readonly level: number; readonly gold: number };
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
  entry.id = "codex-open"; entry.type = "button"; entry.className = "menu-button wood-frame tile-frame";
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
/**
 * Two separate reels on the battle clock (BPH_ARRIVAL): the unit reel brakes to its stop first, then the multiplier
 * reel keeps rolling and lands last, when the troops enter. Cells are the faces each reel passes, easing out.
 */
export const BPH_REVEAL = { unitCells: 14, numberCells: 22, holdMs: BPH_ARRIVAL.hold * 1000 } as const;
/** The deterministic reel: pool order repeated, phased so the cell after the last one is the drawn card. */
export function bphRevealReel(result: BphDrawResult): { readonly order: readonly string[]; readonly start: number; readonly counts: readonly number[]; readonly countStart: number } {
  const pack = BPH_PACKS[result.packId], pool = (pack ? bphDrawPool(pack) : []).map(item => item.id).filter(id => BPH_PROFILES[id] || BPH_TOMES[id]);
  const drawn = result.cards[0].profileId, order = pool.includes(drawn) ? pool : [...pool, drawn];
  const start = ((order.indexOf(drawn) - BPH_REVEAL.unitCells) % order.length + order.length) % order.length;
  const landed = result.multiplier ?? 1;
  const counts = Array.from({ length: Math.max(5, landed) }, (_, index) => index + 1);
  const countStart = ((landed - 1 - BPH_REVEAL.numberCells) % counts.length + counts.length) % counts.length;
  return { order, start, counts, countStart };
}
/** "×5" normally; "×5 → +12" if fewer copies spawned than the roll promised, so the number shown is what spawned. */
export function bphRevealCount(result: BphDrawResult): string {
  const multiplier = result.multiplier ?? 1, wanted = result.cards.reduce((sum, card) => sum + card.copies, 0) * multiplier;
  return result.spawned !== undefined && result.spawned < wanted ? `×${multiplier} → +${result.spawned}` : `×${multiplier}`;
}
/** First discovery of the drawn card, and whether this copy is foil: the codex entry was new at this draw, with the authored discovery reward. */
export function bphRevealDiscovery(result: BphDrawResult): { readonly isNew: boolean; readonly foil: boolean; readonly bonus: number; readonly resource: BphKeptResource | null } {
  const primary = result.cards[0], card = BPH_PROFILES[primary.profileId] ?? BPH_TOMES[primary.profileId];
  const reward = card ? bphMergedReward(card.discoveryResource, card.discoveryBonus) : null;
  return { isNew: primary.discovered, foil: primary.foil, bonus: reward?.amount ?? 0, resource: reward?.resource ?? null };
}
function revealArt(profileId: string, hidden = false): string {
  const profile = BPH_PROFILES[profileId];
  const art = profile ? soldierArt(bphProfileArt(profile.id)) : `<img class="bph-reveal-tome" src="${bphTomeArt(profileId)}" alt="">`;
  return hidden ? `<span data-undiscovered style="display:inline-flex">${art}</span>` : art;
}
/** Recruitment rewards use the existing central unlock layout and acknowledge one item at a time. */
function showPackUnlocks(save: BphSave, onSave: () => void): void {
  if (document.querySelector("dialog[open]")) return;
  const pending = save.lifecycle.claimed.filter(key => key.startsWith("unlock:pack:")
    && !save.lifecycle.claimed.includes(`seen:${key}`));
  if (!pending.length) return;
  const returnFocus = document.activeElement;
  const dialog = document.createElement("dialog"), content = document.createElement("div");
  const picture = document.createElement("img"), name = document.createElement("h2");
  const description = document.createElement("p"), confirm = button("확인", () => {
    save.lifecycle.claimed.push(`seen:${pending.shift()}`);
    onSave();
    if (pending.length) { render(); return; }
    dialog.close(); dialog.remove();
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
  });
  dialog.id = "result-unlock-modal"; dialog.className = "result-unlock-modal";
  name.id = "result-unlock-name"; description.id = "result-unlock-description";
  dialog.setAttribute("aria-labelledby", name.id); dialog.setAttribute("aria-describedby", description.id);
  picture.src = pixelIcon("reinforce"); picture.alt = "";
  description.textContent = t("병력 모집에 추가되었습니다.");
  confirm.className = "menu-button primary"; confirm.autofocus = true;
  const render = () => { name.textContent = tr`${BPH_PACK_NAMES[pending[0].slice("unlock:pack:".length)]} 해금`; };
  dialog.addEventListener("cancel", event => event.preventDefault());
  dialog.addEventListener("keydown", event => {
    if (event.key === "Tab") { event.preventDefault(); confirm.focus(); }
  });
  content.append(picture, name, description); dialog.append(content, confirm);
  document.body.append(dialog); render(); dialog.showModal();
}
/** A recruit is spinning from the press until its last receipt's troops have entered. */
export function bphRecruitBusy(run: Run): boolean {
  return (run.bph?.arrivals?.length ?? 0) > 0;
}
/**
 * An idle press buys the selected pack. A press while the reels spin never queues a second purchase.
 * The shop argument keeps the old first-offer callers working.
 */
export function pressBphRecruit(run: Run, selection: string | BphShop): boolean {
  const battle = run.bph;
  if (!battle || bphRecruitBusy(run)) return false;
  const packId = typeof selection === "string" ? selection : selection.offers.find(offer => !offer.sold)?.packId;
  const acquired = packId ? buyBphRecruitPack(run, packId) : null;
  if (!acquired) return false;
  // A press after the last landing starts its reels now, not after the old result's hold.
  if (battle.arrivalEnd !== undefined) battle.arrivalEnd = Math.min(battle.arrivalEnd, run.time);
  battle.packs.push({ ...acquired, hp: 1, x: WIDTH / 2, y: HEIGHT / 2 + 70 });
  return hitBphPack(run, acquired.id, "reveal").length > 0;
}
/**
 * Owner DM 1794922752.822339. A tap while the reels spin shows that pull's result at once (no new pull, no gold);
 * a tap once it has landed clears the results on show and buys the next. Nothing waits to pull later.
 */
export function tapBphRecruit(run: Run, selection: string | BphShop): "skip" | "pull" | null {
  const battle = run.bph;
  if (!battle) return null;
  if (bphRecruitBusy(run)) return skipBphArrivals(run) ? "skip" : null;
  if (!pressBphRecruit(run, selection)) return null;
  for (let i = battle.receipts.length - 1; i >= 0; i--) {
    const shown = battle.receipts[i];
    if (bphArrival(run, shown.id)) continue;
    acknowledgeBphResult(battle.save, shown.id); battle.receipts.splice(i, 1);
    if (battle.barracksReceipts) battle.barracksReceipts = battle.barracksReceipts.filter(id => id !== shown.id);
  }
  return "pull";
}
export function renderBphShop(host: HTMLElement, context: {
  readonly save: BphSave; readonly effects: () => readonly BphEffect[]; readonly panels: BphPanels;
  readonly milestones: BphMilestones;
  readonly general: BphGeneral; readonly onSave: () => void;
  readonly onStart: (general: BphGeneral) => void; readonly onClose: () => void;
  readonly onPanel?: (panel?: keyof BphPanels) => void;
  readonly onCommander?: (general: BphGeneral, selected: boolean) => void;
  /** The tab the screen opens on, for a shortcut that lands in one. */
  readonly open?: keyof BphPanels;
}): () => void {
  const { save } = context;
  let general = context.general, disposePanel: (() => void) | undefined;
  const shell = document.createElement("section"); shell.className = "bph-management panel wood-frame";
  const header = document.createElement("header"), heading = document.createElement("h1");
  heading.textContent = t("출전 준비"); header.append(heading, bphBackButton(context.onClose));
  const body = document.createElement("div"); body.className = "bph-management-body";
  const balance = document.createElement("p"); balance.className = "bph-balance"; balance.setAttribute("aria-live", "polite");
  const label = document.createElement("div"); label.className = "bph-commanders";
  const condition = document.createElement("p"); condition.className = "bph-general-condition"; condition.hidden = true;
  const info = document.createElement("div"); info.className = "bph-commander-detail";
  // The skill tier reads as pips beside the portrait; the preparation screen prints no growth text.
  const showInfo = () => {
    const card = renderBphCommanderInfo(general);
    const { tier } = growthFor(general, { level: 1, squads: [], bph: { upgrades: context.effects() } });
    card.querySelector(".bph-commander-id")?.insertAdjacentHTML("beforeend", skillPips(tier));
    info.replaceChildren(card);
  };
  for (const name of BPH_GENERALS) {
    const unlocked = save.unlockedGenerals.includes(name);
    const option = button("", () => {
      // The pressed card, the condition line and the detail card always describe the same commander.
      label.querySelectorAll("button").forEach(entry => entry.setAttribute("aria-pressed", String(entry === option)));
      info.hidden = !unlocked; start.disabled = !unlocked;
      if (unlocked) {
        general = name; condition.hidden = true;
        showInfo();
      } else {
        // A locked commander keeps its name hidden: the unlock metric icon and one short condition line show.
        const progress = bphGeneralProgress(save, context.milestones, name);
        const icon = document.createElement("img"), line = document.createElement("span");
        icon.src = pixelIcon(progress?.icon ?? "lock"); icon.alt = "";
        line.textContent = progress ? t(progress.line) : t("미해금");
        condition.replaceChildren(icon, line);
        condition.hidden = false;
      }
    });
    option.className = unlocked ? "bph-commander" : "bph-commander locked";
    option.setAttribute("aria-label", unlocked ? t(tr`${name}${" 선택"}`) : t("미해금"));
    option.setAttribute("aria-pressed", String(name === general));
    const image = document.createElement("img");
    image.src = unlocked ? `./art/portraits/${generalPortrait(name)}.png` : BPH_SILHOUETTE_ART;
    image.alt = "";
    option.append(image);
    if (unlocked) { const caption = document.createElement("span"); caption.textContent = t(name); option.append(caption); }
    label.append(option);
  }
  const actions = document.createElement("nav"), side = document.createElement("div");
  // Receipts a battle ended before revealing are already applied; clear them without printing a history line.
  if (save.pendingResults.length) {
    for (const result of [...save.pendingResults]) acknowledgeBphResult(save, result.id);
    context.onSave();
  }
  side.className = "bph-side"; actions.className = "bph-actions";
  const redraw = () => {
    showInfo();
    balance.innerHTML = `<span><img src="${pixelIcon("mastery")}" alt="${t("강화 포인트")}"> ${Math.floor(save.resources.mastery)}</span><span><img src="${pixelIcon("foil")}" alt="${t("금박")}"> ${save.resources.foilium}</span>`;
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
    showPackUnlocks(save, context.onSave);
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
      if (request === panelRequest) context.onPanel?.();
      side.inert = false;
    });
  };
  for (const [key, text] of [["upgrades", "강화"], ["relics", "유물"]] as const) {
    const render = context.panels[key];
    if (!render) continue;
    // The open tab is its panel's title and its close control: a second tap folds the panel away.
    const tab = button("", async () => {
      if (openTab === tab) { closeSide(); return; }
      const request = ++panelRequest;
      disposePanel?.(); side.replaceChildren();
      context.onPanel?.();
      openTab?.setAttribute("aria-pressed", "false"); openTab = tab; tab.setAttribute("aria-pressed", "true");
      side.textContent = t("불러오는 중…");
      const panel = document.createElement("div");
      const dispose = await render(panel, { save, general, milestones: context.milestones, onChange: () => { context.onSave(); redraw(); },
        onClose: closeSide });
      if (request !== panelRequest) { dispose(); return; }
      side.replaceChildren(...Array.from(panel.childNodes)); disposePanel = dispose;
      body.scrollTop = 0;
      context.onPanel?.(key);
    });
    tab.setAttribute("aria-pressed", "false"); tab.dataset.bphTab = key;
    tab.setAttribute("aria-label", t(text)); tab.title = t(text);
    tab.innerHTML = key === "upgrades"
      ? `<span class="camp"><img src="./art/props/tent.png" alt=""><img class="rise" src="${pixelIcon("up")}" data-tone="gold" alt=""></span>`
      : `<img src="${pixelIcon("relic")}" alt="">`;
    actions.append(tab);
  }
  actions.append(reroll);
  const footer = document.createElement("footer"), start = button("출전", () => {
    context.onCommander?.(general, true);
    context.onStart(general);
  });
  start.className = "menu-button primary"; start.dataset.bphStart = "true";
  body.append(balance, label, condition, actions, info, side); footer.append(start);
  shell.append(header, body, footer); host.replaceChildren(shell); host.hidden = false; redraw();
  context.onPanel?.();
  for (const name of BPH_GENERALS) if (save.unlockedGenerals.includes(name)) context.onCommander?.(name, false);
  if (context.open) actions.querySelector<HTMLButtonElement>(`[data-bph-tab="${context.open}"]`)?.click();
  return () => { panelRequest++; closePanel(shell, () => { disposePanel?.(); shell.remove(); }); };
}
/** The approved join-fx sheets (gate light burst, card glints): the full burst for a new discovery, a small pop otherwise; no drawn shapes. */
const DISCOVERY_FX = `<span class="bph-discovery-burst" aria-hidden="true"></span>`
  + [1, 2, 3].map(n => `<span class="bph-discovery-glint g${n}" aria-hidden="true"></span>`).join("");
const LANDING_FX = `<span class="bph-discovery-burst small" aria-hidden="true"></span><span class="bph-discovery-glint small g2" aria-hidden="true"></span>`;
const MEDIUM_FX = `<span class="bph-discovery-burst medium" aria-hidden="true"></span>`
  + [1, 2].map(n => `<span class="bph-discovery-glint medium g${n}" aria-hidden="true"></span>`).join("");
/** The pop grows with the multiplier (owner DM 1794901972): x1 small, x2-3 medium, x4+ and every new discovery the full burst. */
export function bphLandingBurst(result: BphDrawResult, isNew: boolean): "small" | "medium" | "big" {
  const multiplier = result.multiplier ?? 1;
  return isNew || multiplier >= 4 ? "big" : multiplier >= 2 ? "medium" : "small";
}
const BURST_FX = { small: LANDING_FX, medium: MEDIUM_FX, big: DISCOVERY_FX } as const;
const RING_FRAMES = 12;
/** A smithy tap opens or closes its strip above the recruit packs; play keeps running. */
export function toggleBphSmithy(host: HTMLElement): void {
  const strip = host.querySelector<HTMLElement>(".bph-smithy-strip");
  if (strip) strip.hidden = !strip.hidden;
}
const pips = (level: number, max: number): string =>
  `<span class="bph-smithy-pips" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i${i < level ? ` class="on"` : ""}></i>`).join("")}</span>`;
/** One cell per troop class and one for the wall: picture, level pips, then the next price or a lock. */
function smithyStrip(run: Run, onBought: (purchase: UpgradePurchase) => void): { readonly element: HTMLElement; readonly update: () => void } {
  const element = document.createElement("div");
  element.className = "bph-smithy-strip"; element.hidden = true;
  const coin = pixelIcon("coin"), lock = pixelIcon("lock");
  const cell = (art: string, purchase: { readonly nodeId: string; readonly buy: () => boolean; readonly level: () => number }) => {
    const item = document.createElement("button");
    item.type = "button"; item.className = "bph-smithy-cell";
    item.addEventListener("click", () => {
      if (purchase.buy()) onBought({ nodeId: purchase.nodeId, level: purchase.level(), gold: run.gold });
    });
    const picture = document.createElement("span"), below = document.createElement("span");
    picture.className = "bph-smithy-art"; picture.innerHTML = art; below.className = "bph-smithy-cost";
    item.append(picture, below); element.append(item);
    return { item, below };
  };
  const price = (value: number | null, locked: boolean) => value === null
    ? locked ? `<img src="${lock}" alt="">` : "" : `<span class="bph-smithy-price"><img src="${coin}" alt=""><span class="bph-price">${value}</span></span>`;
  const classes = BPH_SMITHY_CLASSES.map(classId => ({ classId, ...cell(soldierArt(BPH_CLASS_ART[classId]), {
    nodeId: `smithy:${classId}`, buy: () => buyBphSmithyClass(run, classId), level: () => bphSmithyLevel(run, classId),
  }) }));
  const wall = cell(`<img class="bph-smithy-wall" src="./art/props/wall_ew_a.png" alt="">`, {
    nodeId: "smithy:wall", buy: () => buyBphSmithyWall(run), level: () => bphWallTier(run),
  });
  let shown = "";
  const update = () => {
    if (element.hidden) return;
    const cap = run.bph ? bphWallTierCap(run.bph.upgrades) : 0, tier = bphWallTier(run), wallPrice = bphSmithyWallPrice(run);
    const key = `${language()}:${run.gold}:${tier}:${cap}:${classes.map(c => bphSmithyLevel(run, c.classId)).join(",")}`;
    if (key === shown) return;
    shown = key;
    for (const c of classes) {
      const level = bphSmithyLevel(run, c.classId), value = bphSmithyClassPrice(run, c.classId);
      c.item.setAttribute("aria-label", `${t(BPH_CLASS_NAMES[c.classId])} ${t("대장간 강화")}`);
      c.below.innerHTML = pips(level, BPH_SMITHY.maxLevel) + price(value, false);
      c.item.disabled = value === null || run.gold < value;
      c.item.classList.toggle("short", value !== null && run.gold < value);
    }
    wall.item.setAttribute("aria-label", t("대장간 강화"));
    wall.below.innerHTML = pips(tier, BPH_SMITHY.walls.length - 1) + price(wallPrice, tier < BPH_SMITHY.walls.length - 1 && wallPrice === null);
    wall.item.disabled = wallPrice === null || run.gold < wallPrice;
    wall.item.classList.toggle("short", wallPrice !== null && run.gold < wallPrice);
  };
  return { element, update };
}
const RECRUIT_PACK_ART: Readonly<Record<string, string>> = {
  Pack6_Forest: "troop-upgrade-pack-forest.png",
  Pack2_Advanced: "troop-upgrade-pack-advanced.png",
};

export function renderBphField(host: HTMLElement, hireHost: HTMLElement, run: Run, milestones: BphMilestones, onSave: () => void,
  onSfx: (name: "tick" | "discovery") => void = () => undefined,
  locate: (point: Point) => Point | null = () => null, onSmithy: (purchase: UpgradePurchase) => void = onSave,
  onHire: (slot: number) => void = () => undefined): () => void {
  const battle = run.bph;
  if (!battle) return () => { host.replaceChildren(); };
  const layer = document.createElement("div"); layer.className = "bph-field";
  const shop = restockBphRecruit(run);
  const coinArt = pixelIcon("coin"), crateArt = pixelIcon("supply");
  const hires = document.createElement("div"), hireHint = document.createElement("small");
  hires.className = "bph-hire-strip"; hires.setAttribute("role", "group");
  hireHint.className = "bph-hire-hint"; hireHint.hidden = true; hires.append(hireHint);
  let hireHintTimer: number | undefined;
  const hideHireHint = () => {
    hireHint.hidden = true;
    window.clearTimeout(hireHintTimer);
    hireHintTimer = undefined;
  };
  const hireCondition = () => bphGeneralProgress(battle.save, milestones)?.line ?? "";
  const hireReveal = document.createElement("div");
  hireReveal.className = "bph-receipt bph-hire-reveal"; hireReveal.hidden = true;
  hireReveal.setAttribute("aria-live", "polite");
  const fieldFeedback = () => feedbackChannels(document.querySelector("#toggle-motion")?.getAttribute("aria-pressed") === "true",
    document.querySelector("#toggle-flashes")?.getAttribute("aria-pressed") === "true", matchMedia("(prefers-reduced-motion: reduce)").matches);
  let revealUntil = 0;
  const hireCells = bphHireSlots(run).map(({ index }) => {
    const item = button("", () => {
      const status = bphHireSlots(run)[index]?.status;
      if (status === "locked") {
        if (!hireHint.hidden) { hideHireHint(); return; }
        const condition = hireCondition();
        if (!condition) return;
        hireHint.textContent = condition;
        hireHint.hidden = false;
        hireHintTimer = window.setTimeout(hideHireHint, 2500);
        return;
      }
      if (status !== "available") return;
      onHire(index);
      const general = bphHireSlots(run)[index]?.general;
      if (!general) return;
      updateHires();
      const { motion, flash } = fieldFeedback();
      hireReveal.classList.toggle("still", !motion);
      hireReveal.innerHTML = `<span class="bph-reveal-art">${flash ? '<i class="bph-discovery-burst small"></i><i class="bph-discovery-glint small g2"></i>' : ""}
        <span class="bph-reveal-portrait${motion ? " bph-pop" : ""}"><img src="./art/portraits/${generalPortrait(general)}.png" alt=""></span></span>
        <strong class="bph-reveal-name">${tr`${general} 합류`}</strong>`;
      hireReveal.hidden = false;
      revealUntil = run.time + 1.4;
    });
    item.type = "button"; item.className = "bph-hire-cell icon-button big";
    const seat = document.createElement("span"), badge = document.createElement("span");
    seat.className = "skill-slot";
    badge.className = "skill-level-badge bph-hire-price";
    badge.setAttribute("aria-hidden", "true");
    seat.append(item, badge);
    hires.append(seat);
    return { item, seat, badge, key: "" };
  });
  const updateHires = () => {
    const slots = bphHireSlots(run);
    const groupLabel = t("장수 고용");
    const localeChanged = hires.getAttribute("aria-label") !== groupLabel;
    if (localeChanged) hires.setAttribute("aria-label", groupLabel);
    if (!hireHint.hidden) {
      if (!slots.some(slot => slot.status === "locked")) hideHireHint();
      else if (localeChanged) hireHint.textContent = hireCondition();
    }
    hires.hidden = slots.every(slot => slot.status === "joined");
    for (const { index, status, price, general } of slots) {
      const cell = hireCells[index], key = `${language()}:${status}:${price}:${general ?? ""}`;
      if (cell.key === key) continue;
      cell.key = key;
      const { item, seat, badge } = cell;
      // Joined squads already have a real skill card in this row.
      seat.hidden = status === "joined";
      item.dataset["hireSlot"] = String(index);
      item.dataset["hireStatus"] = status;
      item.disabled = status !== "available" && status !== "locked";
      const label = general ? tr`${general} 합류` : status === "locked" ? `${groupLabel}: ${hireCondition()}` :
        `${tr`장수 고용 ${index + 1}: 코인 ${price}`}${status === "unaffordable" ? ` · ${tr`${t("코인")} 부족`}` : ""}`;
      item.setAttribute("aria-label", label); item.title = status === "locked" ? "" : label;
      if (seat.hidden) continue;
      item.innerHTML = `<span class="skill-art bph-hire-portrait" aria-hidden="true"><img src="${BPH_SILHOUETTE_ART}" alt=""><b>?</b></span>`;
      badge.innerHTML = status === "locked" ? `<img src="${pixelIcon("lock")}" alt="">` : `<img src="${coinArt}" alt=""><span class="bph-price">${price}</span>`;
    }
  };
  const recruits = document.createElement("div");
  recruits.className = "bph-recruit-strip"; recruits.setAttribute("role", "group");
  const recruitCells = shop.offers.map(offer => {
    const { packId } = offer;
    const representative = BPH_PACKS[packId].pool.find(item => BPH_PROFILES[item.id]);
    const badge = representative ? soldierArt(bphProfileArt(representative.id))
      : `<img class="bph-recruit-book" src="${bphTomeArt("")}" alt="">`;
    const item = button("", () => {
      if (run.gold >= bphRecruitAsk(run, offer) && tapBphRecruit(run, packId)) onSave();
    });
    item.type = "button"; item.className = "bph-recruit-cell";
    const packArt = RECRUIT_PACK_ART[packId] ?? "troop-upgrade-pack.png";
    item.innerHTML = `<span class="bph-recruit-emblem" aria-hidden="true"><img class="bph-recruit-pack" src="./art/icons/${packArt}" alt=""><span class="bph-smithy-art bph-recruit-badge">${badge}</span></span><span class="bph-smithy-price"><img src="${coinArt}" alt=""><span class="bph-price"></span></span>`;
    const price = item.querySelector<HTMLElement>(".bph-price")!;
    recruits.append(item);
    const art = item.querySelector<HTMLElement>(".bph-recruit-badge")!;
    return { offer, item, price, art, representative };
  });
  let recruitLanguage: ReturnType<typeof language> | undefined;
  const receipt = document.createElement("div");
  receipt.className = "bph-receipt"; receipt.hidden = true; receipt.setAttribute("aria-live", "polite");
  const caption = document.createElement("strong"), art = document.createElement("span"), reward = document.createElement("small");
  art.className = "bph-reveal-art"; caption.className = "bph-reveal-name"; reward.className = "bph-reveal-reward"; reward.hidden = true;
  // Lasting tactics in play: their book inside the shared charge ring, emptying as the effect runs out.
  const tactics = document.createElement("div"); tactics.className = "bph-active-tactics"; tactics.setAttribute("aria-hidden", "true");
  const tacticItems = new Map<string, { readonly element: HTMLElement; full: number }>();
  // Building packs lie on the field as crates; a crate takes the tap before any field strike or building under it.
  const crates = document.createElement("div"); crates.className = "bph-crates";
  const crateButtons = new Map<number, HTMLButtonElement>();
  // Tap-strike volleys ready, bottom right: the arrow in the same charge ring, refilling the next volley, and the count.
  const volleys = document.createElement("div"), volleyCount = document.createElement("b");
  volleys.className = "bph-tap-charges"; volleys.setAttribute("aria-hidden", "true");
  volleys.append(document.createElement("i"), volleyCount);
  // A barracks draw shows on the same receipt above the recruit packs; the tent itself only gets a small glint.
  const barracksSpark = document.createElement("span"); barracksSpark.className = "bph-barracks-spark"; barracksSpark.setAttribute("aria-hidden", "true");
  let sparked = -1;
  const smithy = smithyStrip(run, onSmithy);
  const dock = document.createElement("div"); dock.className = "bph-field-dock";
  dock.append(recruits, volleys);
  if (hireCells.length) { hireHost.append(hires); layer.append(hireReveal); }
  receipt.append(art, caption, reward); layer.append(barracksSpark, crates, tactics, dock, receipt, smithy.element); host.replaceChildren(layer); host.hidden = false;
  let current = -1, skipped = false, displayed = "", closing = false, landedAt = 0, ticked = "", hits = 0;
  let timing: BphArrival | undefined;
  let reel = { order: [] as readonly string[], start: 0, counts: [] as readonly number[], countStart: 0 }, unitPack = false;
  // The reveal never takes pointer events: a tap anywhere lands or dismisses it and still reaches the field.
  const tap = (event: PointerEvent) => {
    if (!layer.isConnected) { document.removeEventListener("pointerdown", tap, true); return; }
    if (!hireHint.hidden) {
      const lockedSlot = event.target instanceof Element && event.target.closest('.bph-hire-cell[data-hire-status="locked"]');
      // Locked buttons toggle the hint in their own click handler, including keyboard activation.
      if (!lockedSlot || !hires.contains(lockedSlot)) hideHireHint();
    }
    // The reels run on the battle clock that brings the troops in; a tap only shortens the hold after landing.
    if (!receipt.hidden && !closing && landedAt) skipped = true;
  };
  document.addEventListener("pointerdown", tap, true);
  // A held discovery card (owner DM 1794929475) is the one part of the reveal that takes the tap: each tap on the card is
  // one hit, and once it is open one more tap closes it. The tap never reaches the field strike or the aim under it.
  const hitCard = (event: Event) => {
    if (!receipt.classList.contains("bph-holding")) return;
    event.stopPropagation(); event.preventDefault();
    if (event.type !== "pointerdown") return;
    if (receipt.classList.contains("bph-cracking")) { hits++; if (hits < BPH_DISCOVERY_HITS) onSfx("tick"); }
    else if (landedAt) skipped = true;
  };
  art.addEventListener("pointerdown", hitCard); art.addEventListener("click", hitCard);
  return () => {
    // A general pick or card choice pauses the field; the dock comes back with play (the 2:50 pick used to hide it for good).
    layer.hidden = run.phase !== "playing";
    hireHost.hidden = layer.hidden;
    if (layer.hidden) { if (!hireHint.hidden) hideHireHint(); return; }
    smithy.update();
    if (hireCells.length) {
      updateHires();
      hireReveal.hidden = run.time >= revealUntil;
    }
    const locale = language(), localeChanged = recruitLanguage !== locale;
    if (localeChanged) recruits.setAttribute("aria-label", t("병력 모집"));
    recruitLanguage = locale;
    for (const { offer, item, price, art, representative } of recruitCells) {
      art.toggleAttribute("data-undiscovered", Boolean(representative && !battle.save.discovered.includes(representative.id)));
      const cost = bphRecruitAsk(run, offer), text = String(cost);
      if (localeChanged || price.textContent !== text) {
        price.textContent = text;
        item.setAttribute("aria-label", `${t(BPH_PACK_NAMES[offer.packId])} ${cost}`);
        item.title = item.getAttribute("aria-label")!;
      }
      item.disabled = run.gold < cost;
    }
    const lying = bphCrates(run);
    for (const pack of lying) {
      let target = crateButtons.get(pack.id);
      if (!target) {
        const id = pack.id, open = (event: Event) => {
          event.stopPropagation(); event.preventDefault();
          if (tapBphCrate(run, id).length) onSave();
        };
        target = document.createElement("button"); target.type = "button"; target.className = "bph-crate";
        target.innerHTML = `<img src="${crateArt}" alt="">`;
        target.addEventListener("pointerdown", open); target.addEventListener("click", open);
        crateButtons.set(id, target); crates.append(target);
      }
      target.setAttribute("aria-label", t("병력 모집"));
      target.style.left = `${pack.x / WIDTH * 100}%`; target.style.top = `${pack.y / HEIGHT * 100}%`;
      target.classList.toggle("blink", run.time >= pack.landAt! + BPH_CRATE.life - BPH_CRATE.blink);
    }
    for (const [id, target] of crateButtons) if (!lying.some(pack => pack.id === id)) { target.remove(); crateButtons.delete(id); }
    for (const [key, until] of Object.entries(battle.fx.timers)) {
      if (!key.startsWith("status:tome:") || !key.endsWith(":until") || until <= run.time || tacticItems.has(key)) continue;
      const element = document.createElement("span"), book = document.createElement("img");
      element.className = "bph-active-tactic"; book.src = bphTomeArt(key.split(":")[3]); book.alt = "";
      element.append(book); tactics.append(element); tacticItems.set(key, { element, full: until - run.time });
    }
    // Every active pointer tactic is the cursor (owner DMs 1794920906.443119, 1794922243.201739): all highlighted, display only.
    const cursorKeys = bphTacticCursor(run)?.keys ?? [];
    for (const [key, item] of tacticItems) {
      const left = (battle.fx.timers[key] ?? 0) - run.time;
      if (left <= 0) { item.element.remove(); tacticItems.delete(key); continue; }
      // Drawing the same tactic again lengthens it: the ring refills to the new remaining time.
      if (left > item.full) item.full = left;
      item.element.style.setProperty("--ring", String(Math.min(RING_FRAMES, Math.round((1 - left / item.full) * RING_FRAMES))));
      item.element.classList.toggle("cursor", cursorKeys.includes(key));
    }
    const strike = bphTapStrike(run);
    volleys.hidden = !strike;
    if (strike) {
      volleys.style.setProperty("--ring", String(Math.round((1 - strike.refill) * RING_FRAMES)));
      volleys.classList.toggle("empty", strike.charges === 0);
      if (volleyCount.textContent !== String(strike.charges)) volleyCount.textContent = String(strike.charges);
    }
    const place = buildings().barracks;
    const result = battle.receipts[0];
    if (!result) { receipt.hidden = true; return; }
    if (current !== result.id) {
      current = result.id; skipped = false; displayed = ""; closing = false; landedAt = 0; ticked = ""; hits = 0;
      reel = bphRevealReel(result); unitPack = bphUnitPack(result.packId); timing = bphArrival(run, result.id);
      receipt.classList.remove("bph-landed", "bph-rare", "bph-closing", "bph-unit-landed", "bph-holding", "bph-cracking");
    }
    const channels = fieldFeedback();
    // Owner DM 1794922523: the barracks result reads exactly like a paid pull; only one small glint on the tent.
    if (sparked !== result.id && battle.barracksReceipts?.includes(result.id)) {
      sparked = result.id;
      const sparkAt = channels.motion ? locate({ x: place.x, y: place.y - 36 }) : null;
      barracksSpark.replaceChildren();
      if (sparkAt) {
        barracksSpark.style.left = `${sparkAt.x}px`; barracksSpark.style.top = `${sparkAt.y}px`;
        barracksSpark.innerHTML = `<span class="bph-discovery-glint small"></span>`;
      }
    }
    receipt.classList.toggle("still", !channels.motion); receipt.classList.toggle("quiet", !channels.flash);
    if (closing) return;
    // A box's later receipt waits for its own start; without motion the result appears only when the troops do.
    const elapsed = timing ? run.time - timing.start : 0, landing = !timing || landedAt > 0 || !bphArrival(run, result.id);
    if (!landing && (elapsed < 0 || (!channels.motion && run.time < timing!.at))) { receipt.hidden = true; return; }
    const unitFrame = bphReelFrame(result, elapsed, { seconds: unitPack ? BPH_ARRIVAL.unitStop : BPH_ARRIVAL.numberStop,
      cells: BPH_REVEAL.unitCells, skipped: landing });
    const frame = bphReelFrame(result, elapsed, { seconds: BPH_ARRIVAL.numberStop, cells: BPH_REVEAL.numberCells, skipped: landing });
    const primary = result.cards[0];
    const shown = unitFrame.done ? primary.profileId : reel.order[(reel.start + unitFrame.index) % reel.order.length];
    const number = frame.done ? bphRevealCount(result) : `×${reel.counts[(reel.countStart + frame.index) % reel.counts.length]}`;
    const step = `${unitFrame.index}:${unitPack ? frame.index : 0}`;
    if (!frame.done && step !== ticked) { if (ticked) onSfx("tick"); ticked = step; }
    // Only the first discovery of a unit/tome or its foil cracks open over three taps.
    const holds = frame.done && bphDiscoveryHolds(result), stage = bphDiscoveryStage(hits), cracking = holds && !stage.revealed;
    const foilPortrait = frame.done && primary.foil && Boolean(BPH_PROFILES[primary.profileId] || BPH_TOMES[primary.profileId]);
    const key = `${language()}:${result.id}:${frame.done ? `done:${stage.hits}` : step}`;
    if (displayed !== key) {
      displayed = key;
      const found = bphRevealDiscovery(result), isNew = frame.done && found.isNew;
      const hidden = cracking || (!frame.done && (!battle.save.discovered.includes(shown) ||
        battle.receipts.some(receipt => receipt.cards.some(card => card.profileId === shown && card.discovered))));
      // The cracking card is only the big question mark (owner DM 1794930270): no silhouette, name or reward until it bursts.
      // The caption keeps its line so the card does not jump when the name appears.
      caption.textContent = hidden ? BPH_UNKNOWN_NAME : t(bphDiscoveryName(shown)); caption.style.visibility = cracking ? "hidden" : "";
      // The rays stack behind the card, one card-scale still frame per hit; a foil card's rays are rainbow.
      const rays = holds ? stage.rays.map((_, index) => bphDiscoveryRay(index, primary.foil)).join("") : "";
      art.innerHTML = cracking
        ? rays + `<span class="bph-crack-card${channels.motion ? stage.hits ? " bph-tremor" : " bph-pop" : ""}"><b class="bph-crack-mark">?</b></span>`
        : rays + (frame.done && channels.motion ? BURST_FX[bphLandingBurst(result, isNew)] : "")
          + (holds || foilPortrait ? `<span class="bph-reveal-portrait${channels.motion ? " bph-pop" : ""}">${revealArt(shown)}</span>` : revealArt(shown, hidden)) + (unitPack ? `<b class="bph-reveal-count">${number}</b>` : "")
          + (holds ? `<b class="bph-reveal-new">${t(bphDiscoveryTag(primary))}</b>` : "");
      // An opened foil wears the battle's prism shimmer on its codex portrait, which matches the battle sprite.
      if (foilPortrait && !cracking) void (async () => {
        const { bphArtElement, bphProfilePicture, bphWithPrism } = await import("./bph-codex-page");
        const slot = art.querySelector(".bph-reveal-portrait");
        if (!slot || displayed !== key) return;
        const picture: BphCodexPicture = BPH_PROFILES[primary.profileId] ? bphProfilePicture(primary.profileId)
          : { kind: "image", src: bphTomeArt(primary.profileId) };
        slot.replaceChildren(bphArtElement(bphWithPrism(picture, bphPrism(primary.profileId, true))));
      })().catch(() => undefined);
      // The landing pop grows with the multiplier: x1 the 1f1eae9 size, x5 twice it.
      art.style.setProperty("--burst", String(1 + ((result.multiplier ?? 1) - 1) / 4));
      reward.hidden = cracking || !(isNew && found.bonus > 0 && found.resource);
      // Upgrade points read as the mastery icon and the number; the words stay in the accessible name.
      const words = reward.hidden ? "" : `${t(BPH_RESOURCE_LABELS[found.resource!])} +${found.bonus}`;
      if (!reward.hidden && found.resource === "mastery") reward.innerHTML = `<img src="${pixelIcon("mastery")}" alt="">+${found.bonus}`;
      else reward.textContent = words;
      if (words) reward.setAttribute("aria-label", words); else reward.removeAttribute("aria-label");
    }
    // The burst lands on the third hit; the battle never pauses and the card then closes like any result.
    if (frame.done && !cracking && !landedAt) {
      landedAt = performance.now(); skipped = false;
      if (holds) onSfx("discovery");
    }
    receipt.classList.toggle("bph-holding", holds);
    receipt.classList.toggle("bph-cracking", cracking);
    receipt.classList.toggle("bph-discovered", frame.done && !cracking && bphRevealDiscovery(result).isNew);
    receipt.classList.toggle("bph-spinning", !frame.done); receipt.hidden = false;
    receipt.classList.toggle("bph-unit-landed", unitFrame.done && !frame.done);
    receipt.classList.toggle("bph-rare", frame.done && !cracking && primary.foil);
    receipt.classList.toggle("bph-landed", frame.done && !cracking);
    if (landedAt && (skipped || performance.now() - landedAt >= BPH_REVEAL.holdMs)) {
      closing = true; receipt.classList.remove("bph-holding"); receipt.classList.add("bph-closing");
      const finish = () => {
        acknowledgeBphResult(battle.save, result.id); receipt.hidden = true;
        const at = battle.receipts.indexOf(result);
        if (at >= 0) battle.receipts.splice(at, 1);
        if (battle.barracksReceipts) battle.barracksReceipts = battle.barracksReceipts.filter(id => id !== result.id);
        onSave();
      };
      void Promise.all(receipt.getAnimations().map(animation => animation.finished)).then(finish, finish);
    }
  };
}
