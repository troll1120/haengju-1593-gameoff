import { language, t, tr } from "./i18n";
import type { BphClass, BphSave } from "./bph-contract";
import { BPH_ENEMY_MAP, BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { BPH_CLASS_TEXT, BPH_CODEX_TEXT, BPH_GENERAL_TEXT } from "./bph-codex-data";
import type { CodexTextId } from "./bph-codex-data";
import { BPH_GENERALS } from "./bph-commanders";
import { bphLockedGeneralCondition } from "./bph-unlock-condition";
import type { BphMilestones } from "./bph-commanders";
import { bphBackButton } from "./bph-view";
import { pixelIcon } from "./icons";
import { BPH_BOSS_TEXT, BPH_CODEX_GROUPS, bphEnemyDisplayName } from "./bph-codex-groups";
import {
  BPH_CODEX_UNKNOWN, BPH_CODEX_UNKNOWN_NAME, bphArtElement, bphCodexClassViews, bphGeneralArt,
  bphGeneralPage, bphHiddenPage, bphSlotArt, bphSlotPage, bphSummaryPage, bphWithPrism, el,
} from "./bph-codex-page";
import { BPH_FOIL_PRISM } from "./bph-prism";
import type { BphCodexArt, BphCodexPage } from "./bph-codex-page";
import "./bph-codex.css";

export type BphCodexTab = "allies" | "tomes" | "enemies" | "generals";
const TABS: readonly (readonly [BphCodexTab, string])[] = [["allies", "아군"], ["tomes", "책략"], ["enemies", "적군"], ["generals", "장수"]];

/** Recruitment opens the codex, so show the next guaranteed new soldier before any card is selected. */
export function bphCodexRecruitProgress(save: BphSave): { opened: number; target: number } | null {
  const opened = save.packs.Pack1_Basic?.opened ?? 0;
  const next = BPH_PACKS.Pack1_Basic.opening.find(item => item.dimension === save.dimension
    && item.ordinal > opened && item.ids.some(id => id !== "Hero1_Squire"
      && BPH_PROFILES[id] && !save.discovered.includes(id)));
  return next ? { opened, target: next.ordinal } : null;
}

/** Read-only presentation model; discovery and rewards belong to CORE. */
export function bphCodexEntries(save: BphSave) {
  return BPH_CODEX_GROUPS.map(({ slot, variants }) => {
    const profile = slot.kind === "hero" ? BPH_PROFILES[slot.id] : undefined;
    const tome = slot.kind === "tome" ? BPH_TOMES[slot.id] : undefined;
    const enemy = slot.kind === "enemy" ? BPH_ENEMY_MAP[slot.id] : undefined;
    const textId = enemy?.bossId ? BPH_BOSS_TEXT[enemy.bossId]
      : profile ? BPH_CLASS_TEXT[profile.classId] : null;
    const text = textId ? BPH_CODEX_TEXT[textId] : undefined;
    const name = profile?.name ?? tome?.name ?? bphEnemyDisplayName(slot.id) ?? "";
    return {
      slot, variants, profile, tome, text, textId, enemy, name,
      label: t(name),
      discovered: variants.some(variant => save.discovered.includes(variant.id)),
      foil: variants.some(variant => save.foils.includes(variant.id)),
      unread: variants.some(variant => save.discovered.includes(variant.id) && !save.seen.includes(variant.id)),
    };
  });
}

export function bphCodexTextLines(id: CodexTextId): readonly string[] {
  const text = BPH_CODEX_TEXT[id];
  return "text" in text ? [text.text] : [
    `${text.side === "japan" ? "일본" : text.side} · ${text.years} · ${text.title}`,
    tr`주요 전투: ${text.battles}`, tr`최후: ${text.end}`,
  ];
}

type Card = {
  readonly key: string; readonly label: string; readonly art: BphCodexArt; readonly rarity: number | null;
  readonly discovered: boolean; readonly unread: boolean; readonly foil: boolean;
};
/** The index cards of one tab. An undiscovered entry or a commander not yet unlocked shows no name and no art. */
export function bphCodexCards(save: BphSave, tab: BphCodexTab, group: BphClass): readonly Card[] {
  if (tab === "generals") return BPH_GENERALS.map(general => {
    const unlocked = save.unlockedGenerals.includes(general);
    return { key: `general:${general}`, label: unlocked ? t(general) : BPH_CODEX_UNKNOWN_NAME,
      art: unlocked ? bphGeneralArt(general) : BPH_CODEX_UNKNOWN,
      rarity: null, discovered: unlocked, unread: false, foil: false };
  });
  return bphCodexEntries(save).filter(entry => tab === "allies" ? entry.profile?.classId === group
    : tab === "tomes" ? entry.slot.kind === "tome" : entry.slot.kind === "enemy")
    .sort((a, b) => Number(!!a.enemy?.bossId) - Number(!!b.enemy?.bossId)).map(entry => ({
    key: entry.slot.id, label: entry.discovered ? entry.label : BPH_CODEX_UNKNOWN_NAME,
    art: entry.discovered ? bphWithPrism(bphSlotArt(entry.slot), entry.foil ? BPH_FOIL_PRISM : 0) : BPH_CODEX_UNKNOWN,
    rarity: entry.discovered ? entry.profile?.rarity ?? entry.tome?.rarity ?? null : null,
    discovered: entry.discovered, unread: entry.unread, foil: entry.discovered && entry.foil,
  }));
}

export function renderBphCodex(host: HTMLElement, context: {
  readonly save: BphSave;
  readonly milestones: BphMilestones;
  readonly readOnly?: boolean;
  /** A short header badge, such as the preview build's "everything found" mark. */
  readonly notice?: string;
  readonly onChange: () => void;
  readonly onClose: () => void;
}): () => void {
  const { save } = context, abort = new AbortController(), signal = abort.signal;
  const entries = () => bphCodexEntries(save);
  const firstUnread = entries().find(entry => entry.unread && entry.profile);
  let tab: BphCodexTab = "allies", group: BphClass = firstUnread?.profile?.classId ?? "spearman", selected: string | null = null;

  const shell = el("section", "bph-codex panel wood-frame");
  shell.setAttribute("aria-label", t("도감"));
  const header = el("header", "bph-codex-head");
  header.append(el("h1", "", t("도감")),
    ...(context.notice ? [el("span", "bph-codex-preview", context.notice)] : []), bphBackButton(context.onClose));
  const book = el("div", "bph-codex-book"), index = el("div", "bph-codex-index"), page = el("article", "bph-codex-page");
  const tabs = el("div", "bph-codex-tabs"), classes = el("div", "bph-codex-classes"), caption = el("p", "bph-codex-group");
  const grid = el("div", "bph-codex-grid");
  tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", t("도감 분류"));
  classes.setAttribute("role", "tablist"); classes.setAttribute("aria-label", t("병종"));
  page.setAttribute("aria-label", t("상세"));
  index.append(tabs, classes, caption, grid);
  book.append(index, page);
  shell.append(header, book);

  const tabButton = (label: string, on: boolean, act: () => void) => {
    const control = el("button", "", t(label));
    control.type = "button"; control.setAttribute("role", "tab"); control.setAttribute("aria-selected", String(on));
    control.addEventListener("click", act, { signal });
    return control;
  };
  /** A name the two-line limit would cut steps down one type size; a name that fits keeps the card's own size. */
  const fitLabels = () => {
    const labels = Array.from(grid.querySelectorAll<HTMLElement>(".bph-codex-label"));
    for (const label of labels) label.classList.remove("is-long");
    // Glyphs taller than the line box overflow it by a pixel or two; a cut name hides at least one whole line.
    const cut = labels.filter(label => label.scrollHeight - label.clientHeight >= parseFloat(getComputedStyle(label).lineHeight) / 2);
    for (const label of cut) label.classList.add("is-long");
  };
  const drawIndex = () => {
    const classViews = bphCodexClassViews(save);
    tabs.replaceChildren(...TABS.map(([id, label]) => tabButton(label, tab === id, () => { tab = id; drawIndex(); })));
    classes.hidden = tab !== "allies";
    classes.replaceChildren(...classViews.map(view => {
      const control = el("button", "bph-codex-class");
      control.type = "button"; control.setAttribute("role", "tab"); control.setAttribute("aria-selected", String(group === view.classId));
      control.setAttribute("aria-label", `${view.label} ${view.found}/${view.total}`);
      control.dataset.complete = String(view.found === view.total);
      control.append(bphArtElement(view.art, true), el("span", "", `${view.found}/${view.total}`));
      control.addEventListener("click", () => { group = view.classId; drawIndex(); }, { signal });
      return control;
    }));
    caption.textContent = tab === "allies" ? classViews.find(view => view.classId === group)?.label ?? ""
      : t(TABS.find(([id]) => id === tab)?.[1] ?? "");
    grid.setAttribute("aria-label", caption.textContent);
    if (tab === "allies") {
      const progress = bphCodexRecruitProgress(save), hint = el("span", "bph-codex-recruit");
      const image = el("img"); image.src = pixelIcon("card"); image.alt = "";
      hint.append(image, progress ? tr`모집 ${progress.opened}/${progress.target}` : t("모집 → 도감"));
      hint.setAttribute("aria-label", progress
        ? tr`기본 병력 모집 ${progress.opened}/${progress.target} · 새 병사`
        : t("모집 → 도감"));
      caption.append(hint);
    }
    grid.replaceChildren(...bphCodexCards(save, tab, group).map(card => {
      const control = el("button", "bph-codex-card");
      control.type = "button"; control.dataset.codexKey = card.key; control.dataset.discovered = String(card.discovered);
      control.setAttribute("aria-pressed", String(selected === card.key));
      control.setAttribute("aria-label", [card.label, ...(card.unread ? [t("미열람")] : [])].join(", "));
      control.append(bphArtElement(card.art), el("span", "bph-codex-label", card.label));
      if (card.unread) control.append(el("span", "bph-codex-unread"));
      if (card.foil) {
        const foil = el("img", "bph-codex-foil"); foil.src = pixelIcon("foil"); foil.alt = t("금박");
        control.append(foil);
      }
      control.addEventListener("click", () => open(card.key), { signal });
      return control;
    }));
    fitLabels();
  };
  const pageFor = (key: string): BphCodexPage => {
    if (key.startsWith("general:")) {
      const general = BPH_GENERALS.find(name => `general:${name}` === key) ?? BPH_GENERALS[0];
      return save.unlockedGenerals.includes(general)
        ? bphGeneralPage(save, general, BPH_GENERAL_TEXT[BPH_GENERALS.indexOf(general)], context.milestones)
        : bphHiddenPage(save, null, bphLockedGeneralCondition(save, context.milestones, general));
    }
    const entry = entries().find(model => model.slot.id === key);
    if (!entry) return bphSummaryPage(save);
    return entry.discovered ? bphSlotPage(save, entry.slot, entry.name, entry.textId, entry.variants)
      : bphHiddenPage(save, entry.slot, null);
  };
  const drawPage = () => {
    const view = selected ? pageFor(selected) : bphSummaryPage(save);
    if (selected) {
      const close = el("button", "icon-button bph-codex-x");
      close.type = "button"; close.setAttribute("aria-label", t("닫기"));
      const image = el("img"); image.src = pixelIcon("plus"); image.alt = "";
      close.append(image);
      close.addEventListener("click", closeDetail, { signal });
      view.head.append(close);
    }
    page.dataset.view = selected ?? "summary";
    page.replaceChildren(view.head, ...view.body);
    page.scrollTop = 0;
  };
  const open = (key: string) => {
    selected = key;
    const unread = entries().find(entry => entry.slot.id === key)?.variants
      .filter(slot => save.discovered.includes(slot.id) && !save.seen.includes(slot.id)) ?? [];
    if (!context.readOnly && unread.length) {
      save.seen.push(...unread.map(slot => slot.id));
      context.onChange();
    }
    drawIndex(); drawPage();
  };
  const closeDetail = () => {
    const key = selected;
    selected = null;
    drawIndex(); drawPage();
    grid.querySelector<HTMLElement>(`[data-codex-key="${key}"]`)?.focus({ preventScroll: true });
  };
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || host.hidden) return;
    event.preventDefault();
    if (selected) closeDetail(); else context.onClose();
  }, { signal });
  addEventListener("resize", fitLabels, { signal });
  host.replaceChildren(shell);
  drawIndex(); drawPage();
  void document.fonts.ready.then(() => { if (!signal.aborted) fitLabels(); });
  return () => { abort.abort(); shell.remove(); };
}
