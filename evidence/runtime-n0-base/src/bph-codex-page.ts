import { language, t, tr } from "./i18n";
import type { BphClass, BphSave } from "./bph-contract";
import { BPH_CLASS_NAMES, BPH_ENEMY_MAP, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { BPH_CLASS_TEXT, BPH_CODEX_SLOTS, BPH_CODEX_TEXT } from "./bph-codex-data";
import type { CodexTextId } from "./bph-codex-data";
import { BPH_CODEX_BATTLE_SIDE_LABELS, BPH_CODEX_HISTORY, BPH_CODEX_HISTORY_LABELS, BPH_CODEX_VERDICT_LABELS } from "./bph-codex-history";
import { bphCodexDetails } from "./bph-codex-details";
import type { BphCodexAbility, BphCodexValue } from "./bph-codex-details";
import { BPH_CODEX_CLASS_REWARDS, BPH_CODEX_COSMETICS, BPH_CODEX_DISCOVERY_GOLD, bphCodexRewardView } from "./bph-codex-rewards";
import { BPH_GENERAL_CLASS } from "./bph-commanders";
import type { BphGeneral } from "./bph-commanders";
import { bphBioLine, bphCommanderSkill, bphFactList } from "./bph-commander-info";
import type { BphFact } from "./bph-commander-info";
import { bphArtFile, BPH_CLASS_ART } from "./bph-art";
import { bphCodexUnread } from "./bph-view";
import { pixelIcon } from "./icons";
import type { IconName } from "./icons";
import { generalUnit, GENERAL_HP } from "./roster";
import { SKILL_ICONS, skillIconFile } from "./card-art";
import { bphCodexCompletion } from "./bph-codex-groups";
import { allyAnimation } from "./ally-animation";
import { ENEMY_ANIMATIONS, enemyArt, GENERAL_SHEET_COLUMNS } from "./enemy-animation";
import type { EnemyArt } from "./enemy-animation";
import { BOSS_FRAME, UNIT_FRAME } from "./sprite-layout";
import { SHIP_FRAME, SHIP_TEXTURES } from "./river";
import type { BossId } from "./bosses";
import type { EnemyKind } from "./rules";

type BphCodexRect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
/**
 * A battle texture key, the file the battle loads under it and the frame of it the codex shows. `view` is the part of
 * that frame a card draws and `scale` its whole multiple, so every figure gets the same size per source pixel.
 */
export type BphCodexPicture =
  | { readonly kind: "sprite"; readonly key: string; readonly frame: number | null; readonly src: string;
    readonly rect: BphCodexRect; readonly view: BphCodexRect; readonly scale: number }
  | { readonly kind: "image"; readonly src: string };
export type BphCodexArt = BphCodexPicture | { readonly kind: "unknown" };
export type BphCodexPage = { readonly head: HTMLElement; readonly body: readonly HTMLElement[] };
type Slot = typeof BPH_CODEX_SLOTS[number];

export const BPH_CODEX_CLASSES: readonly BphClass[] = ["spearman", "archer", "militia", "monk", "hwacha", "chongtong", "joseon_cavalry", "panokseon"];
/** Undiscovered entries give no hint of what they are: a question mark and no name. */
export const BPH_CODEX_UNKNOWN: BphCodexArt = { kind: "unknown" };
export const BPH_CODEX_UNKNOWN_NAME = "???";
const RARITIES = ["일반", "희귀", "영웅", "전설"] as const;
const CHECK = "./art/icons/bph-node-check.webp";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function icon(src: string): HTMLImageElement {
  const picture = el("img");
  picture.src = src; picture.alt = "";
  return picture;
}
function section(title: string, ...children: Node[]): HTMLElement {
  const box = el("section", "bph-codex-section");
  box.append(el("h3", "", title), ...children);
  return box;
}

type BattleFrame = { readonly key: string; readonly frame?: number };
const FRONT_IDLE = { moving: false, attacking: false, hurt: false, down: false, direction: "front" } as const;
/** Ship sheets hold 14 cells per facing row, as enemy-animation registers them. */
const SHIP_COLUMNS = 14;
/** Every card figure is drawn at this multiple; a ship fills its whole frame and only fits the art cell at half of it. */
const FIGURE_SCALE = 2;
/** Full-body frames keep the standing figure inside this bottom-centre window; the rest is margin for attack poses. */
const FULL_BODY_VIEW = { width: 34, height: 42 } as const;
/** The file and source rect the battle's preload gives one registered animation frame. */
function battlePicture({ key, frame }: BattleFrame): BphCodexPicture {
  const cell = (columns: number, size: { readonly width: number; readonly height: number }, index = frame ?? 0) =>
    ({ x: index % columns * size.width, y: Math.floor(index / columns) * size.height, ...size });
  const body = (rect: BphCodexRect): BphCodexRect => ({ ...FULL_BODY_VIEW,
    x: rect.x + (rect.width - FULL_BODY_VIEW.width) / 2, y: rect.y + rect.height - FULL_BODY_VIEW.height });
  const sheet = /^(?:boss|ally)-sheet-(.+)$/.exec(key), single = /^ally-frame-(.+)-(front|back|side)-([a-z]+)-(\d+)$/.exec(key);
  if (sheet) {
    const rect = cell(GENERAL_SHEET_COLUMNS, BOSS_FRAME);
    return { kind: "sprite", key, frame: frame ?? 0, src: `./art/generals/${sheet[1]}.webp`, rect, view: body(rect), scale: FIGURE_SCALE };
  }
  if (single) {
    const rect = cell(1, BOSS_FRAME, 0);
    return { kind: "sprite", key, frame: null, src: `./art/generals/${single[1]}/${single[2]}_${single[3]}_${single[4]}.png`,
      rect, view: body(rect), scale: FIGURE_SCALE };
  }
  if (SHIP_TEXTURES.some(ship => ship === key)) {
    const rect = cell(SHIP_COLUMNS, SHIP_FRAME);
    return { kind: "sprite", key, frame: frame ?? 0, src: `./art/ships/${key}.png`, rect, view: rect, scale: FIGURE_SCALE / 2 };
  }
  const rect = cell(2, UNIT_FRAME);
  return { kind: "sprite", key, frame: frame ?? 0, src: `./art/units/${bphArtFile(key)}.png`, rect, view: rect, scale: FIGURE_SCALE };
}
/** Allies and enemies resolve through the battle's own front-idle animation, so newly wired full pose sets reach the codex unchanged. */
const allyPicture = (base: string): BphCodexPicture => battlePicture(base === "panokseon"
  ? ENEMY_ANIMATIONS["enemy-panokseon-front-idle"].frames[0] : allyAnimation(base, FRONT_IDLE).frames[0]);
export const bphEnemyPicture = (art: EnemyArt): BphCodexPicture =>
  battlePicture(ENEMY_ANIMATIONS[art.full || art.ship ? `enemy-${art.base}-front-idle` : `enemy-${art.base}-idle`].frames[0]);
/** The battle's art identity for a codex enemy, from the same appearance fields its spawns carry. */
export function bphCodexEnemyArt(id: string): EnemyArt {
  const enemy = BPH_ENEMY_MAP[id];
  return enemyArt({ kind: enemy.kind as EnemyKind, boss: !!enemy.bossId, elite: false,
    bossArt: (enemy.bossId ?? undefined) as BossId | undefined, pattern: undefined, shipArt: undefined, ladder: false });
}
export const bphClassArt = (classId: BphClass): BphCodexPicture => allyPicture(BPH_CLASS_ART[classId]);
export function bphSlotArt(slot: Slot): BphCodexPicture {
  if (slot.kind === "hero") return bphClassArt(BPH_PROFILES[slot.id].classId);
  if (slot.kind === "tome") return { kind: "image", src: "./art/icons/tome-book-svg.webp" };
  return bphEnemyPicture(bphCodexEnemyArt(slot.id));
}
export const bphGeneralArt = (general: BphGeneral): BphCodexPicture => allyPicture(generalUnit(general));
/** Cards and detail heads draw a figure at its own scale; the small list icons (class tabs, reward rows) at half of it. */
export function bphArtElement(art: BphCodexArt, small = false): HTMLElement {
  const frame = el("span", "bph-codex-art");
  frame.dataset.art = art.kind;
  if (art.kind === "unknown") { frame.textContent = "?"; frame.setAttribute("aria-hidden", "true"); return frame; }
  const picture = icon(art.src);
  if (art.kind === "image") { frame.append(picture); return frame; }
  const scale = small ? art.scale / 2 : art.scale, cell = el("span", "bph-codex-sprite");
  cell.style.width = `${art.view.width * scale}px`; cell.style.height = `${art.view.height * scale}px`;
  picture.style.transform = `scale(${scale})`;
  picture.style.left = `${-art.view.x * scale}px`; picture.style.top = `${-art.view.y * scale}px`;
  frame.dataset.texture = art.key;
  cell.append(picture); frame.append(cell);
  return frame;
}
export function bphRarity(rarity: number, named: boolean): HTMLElement {
  const row = el("span", "bph-codex-rarity");
  row.setAttribute("aria-label", t(RARITIES[rarity] ?? ""));
  for (let star = 0; star < RARITIES.length; star++) row.append(icon(pixelIcon(star <= rarity ? "star" : "star-empty")));
  if (named) row.append(el("span", "", t(RARITIES[rarity] ?? "")));
  return row;
}

const FACT_ICONS: Readonly<Record<string, IconName>> = {
  체력: "heart", 공격력: "attack", "공격 간격": "hourglass", 사거리: "crossbow", "이동 속도": "pierce", "공격 반경": "motion",
  "치명타 확률": "flash", "치명타 배율": "skill-up", "막기 확률": "shield", "피해 감소": "skill-shield", "성벽 피해": "home",
  피해: "attack", "돌진 피해": "attack", "도착 범위 피해": "attack", "기본 피해": "attack", 기절: "flash",
  지속: "hourglass", 주기: "hourglass", "최소 주기": "hourglass", "최대 주기": "hourglass", "당김 시간": "hourglass",
  반경: "motion", "피해 반경": "motion", "궤도 반경": "motion", 각속도: "motion",
  "최소 거리": "pierce", "최대 거리": "pierce", "당김 거리": "pierce", "이동 속도 배율": "pierce", "연속 돌진": "pierce", "이동 횟수": "pierce",
  "대상 수": "reinforce", "소환 수": "reinforce", "동반 병력": "reinforce", 칼날: "sword", "주기당 발동": "plus",
  "효과 위력": "skill-up", "실제 피해 대비 회복": "heart",
};
const CORE_STATS = new Set(["체력", "공격력", "공격 간격", "사거리"]);
const shown = (value: number): number => Number(value.toFixed(Math.abs(value) >= 10 ? 0 : 2));
export function bphCodexValueText(value: BphCodexValue): string {
  if (value.label === "최대 거리" && value.value === 0) return t("제한 없음");
  const amount = shown(value.value);
  switch (value.unit) {
    case "초": return tr`${amount}초`;
    case "배": return tr`${amount}배`;
    case "회": return tr`${amount}회`;
    case "명": return tr`${amount}명`;
    case "개": return tr`${amount}개`;
    case "도/초": return tr`${amount}도/초`;
    case "%": return `${amount}%`;
    default: return String(amount);
  }
}
const facts = (values: readonly BphCodexValue[]): BphFact[] =>
  values.map(value => ({ icon: FACT_ICONS[value.label] ?? "skill-up", label: value.label, value: bphCodexValueText(value) }));
const STAT_ORDER = ["체력", "공격력", "공격 간격", "사거리", "이동 속도", "공격 반경", "치명타 확률", "치명타 배율", "막기 확률", "피해 감소", "성벽 피해"];
/**
 * The stat rows of any codex entry, given one stat list per identity it covers: a single value, or the range
 * across merged variants. Allies, enemies and commanders share this order and these labels.
 */
export function bphCodexStatFacts(variants: readonly (readonly BphCodexValue[])[]): BphFact[] {
  return (variants[0] ?? []).map((stat, index) => {
    const values = variants.map(stats => stats[index].value);
    return { stat, low: Math.min(...values), high: Math.max(...values) };
  }).filter(({ stat, low, high }) => CORE_STATS.has(stat.label) || low !== 0 || high !== 0)
    .sort((a, b) => STAT_ORDER.indexOf(a.stat.label) - STAT_ORDER.indexOf(b.stat.label))
    .map(({ stat, low, high }) => ({
      icon: FACT_ICONS[stat.label] ?? "skill-up", label: stat.label,
      value: low === high ? bphCodexValueText({ ...stat, value: low })
        : `${bphCodexValueText({ ...stat, value: low })}-${bphCodexValueText({ ...stat, value: high })}`,
    }));
}
/** The one stat block every codex detail page draws. */
const statList = (variants: readonly (readonly BphCodexValue[])[]): HTMLElement => bphFactList(bphCodexStatFacts(variants));

const NOT_FOR_PLAYERS = /미확인|실행기|실행식|미지원|대기열|최대 거리가 0이면|강화 전 기준/;
const PLAYER_WORDING: Readonly<Record<string, string>> = {
  "공격 시 자신을 제외한 살아 있는 무작위 아군에게 Charge": "공격 시 자신을 뺀 무작위 아군의 다음 공격 강화",
};
/** Engine notes stay in the data module; players see what happens and whether it happens at all. */
export function bphCodexSkillLines(ability: BphCodexAbility): readonly string[] {
  if (!ability.implemented) return [t("지금 전투에서는 발동하지 않는 기술입니다.")];
  return ability.condition.split(/;\s*/).filter(part => part && !NOT_FOR_PLAYERS.test(part)).map(part => {
    const summon = /^주기마다 (.+?)(?: · (?:일반|희귀|영웅|전설))? 소환$/.exec(part);
    return summon ? tr`주기마다 ${t(summon[1])} 소환` : t(PLAYER_WORDING[part] ?? part);
  });
}
function skillCard(ability: BphCodexAbility): HTMLElement {
  const card = el("div", ability.implemented ? "bph-skill-card" : "bph-skill-card is-inactive");
  const [lead = "", ...notes] = bphCodexSkillLines(ability), head = el("strong");
  head.append(icon(pixelIcon(ability.implemented ? "skill-up" : "lock")), lead);
  card.append(head, ...notes.map(line => el("p", "", line)));
  if (ability.implemented && ability.values.length) card.append(bphFactList(facts(ability.values)));
  return card;
}

function heading(art: BphCodexArt, name: string, ...lines: Node[]): HTMLElement {
  const head = el("header", "bph-codex-page-head"), title = el("div", "bph-codex-title");
  title.append(el("h2", "", name), ...lines);
  head.append(bphArtElement(art), title);
  return head;
}
const sub = (...parts: (string | Node)[]): HTMLElement => {
  const line = el("p", "bph-codex-sub");
  line.append(...parts);
  return line;
};
function claimedBy(save: BphSave, key: string): boolean {
  return (save.codexRewards?.claimed ?? []).includes(key);
}
function rewardLine(label: string, picture: string, amount: string, claimed: boolean): HTMLElement {
  const row = el("p", claimed ? "bph-codex-reward is-claimed" : "bph-codex-reward");
  row.append(el("span", "", t(label)), icon(picture), el("b", "", amount));
  if (claimed) row.append(icon(CHECK), el("span", "", t("받음")));
  return row;
}
function discoveryReward(save: BphSave, id: string): HTMLElement {
  return rewardLine("첫 발견 보상", pixelIcon("coin"), tr`금 ${BPH_CODEX_DISCOVERY_GOLD}`, claimedBy(save, `discovery:${id}`));
}
export function bphClassMembers(classId: BphClass): readonly Slot[] {
  return BPH_CODEX_SLOTS.filter(slot => slot.kind === "hero" && BPH_PROFILES[slot.id]?.classId === classId);
}
/** One row per ally class, for the class tabs and the class reward list. A class with nothing found shows no sprite and no name. */
export function bphCodexClassViews(save: BphSave) {
  return BPH_CODEX_CLASSES.map(classId => {
    const members = bphClassMembers(classId), found = members.filter(slot => save.discovered.includes(slot.id)).length;
    return { classId, found, total: members.length,
      label: found ? t(BPH_CLASS_NAMES[classId]) : BPH_CODEX_UNKNOWN_NAME,
      art: found ? bphClassArt(classId) : BPH_CODEX_UNKNOWN };
  });
}
function classReward(save: BphSave, classId: BphClass): HTMLElement {
  const members = bphClassMembers(classId), found = members.filter(slot => save.discovered.includes(slot.id)).length;
  const row = rewardLine("병종 완성 보상", pixelIcon("relic"), t("유물 1개"), claimedBy(save, `class:${classId}`));
  row.prepend(el("span", "bph-codex-tally", `${t(BPH_CLASS_NAMES[classId])} ${found}/${members.length}`));
  return row;
}

function historySections(id: CodexTextId): HTMLElement[] {
  const record = BPH_CODEX_HISTORY[id], lang = language(), out: HTMLElement[] = [];
  if (record.kind === "person") {
    out.push(section(BPH_CODEX_HISTORY_LABELS.achievement[lang], el("p", "", record.achievement.text[lang])));
    const list = el("ul", "bph-codex-battles");
    for (const battle of record.battles) {
      const item = el("li"), head = el("div", "bph-codex-battle-head"), verdict = el("span", "bph-codex-verdict", BPH_CODEX_VERDICT_LABELS[battle.verdict][lang]);
      verdict.dataset.verdict = battle.verdict;
      head.append(el("strong", "", battle.name[lang]), verdict, el("span", "bph-codex-side", BPH_CODEX_BATTLE_SIDE_LABELS[battle.side][lang]));
      item.append(head, el("p", "", battle.text[lang]));
      list.append(item);
    }
    if (record.battles.length) out.push(section(BPH_CODEX_HISTORY_LABELS.battles[lang], list));
  }
  out.push(section(BPH_CODEX_HISTORY_LABELS.anecdote[lang], el("p", "", record.anecdote.text[lang])));
  const text = BPH_CODEX_TEXT[id];
  if (lang === "ko" && !("text" in text)) {
    out.push(section(t("약력"), el("p", "", tr`주요 전투: ${text.battles}`), el("p", "", tr`최후: ${text.end}`)));
  }
  return out;
}
function unitBackground(id: CodexTextId): HTMLElement {
  const text = BPH_CODEX_TEXT[id];
  const line = language() === "ko" && "text" in text ? text.text : BPH_CODEX_HISTORY[id].anecdote.text[language()];
  return section(t("병종 설명"), el("p", "", line));
}

export function bphEnemyNumber(id: string): number {
  const kind = BPH_ENEMY_MAP[id].kind;
  const same = BPH_CODEX_SLOTS.filter(slot => slot.kind === "enemy" && !BPH_ENEMY_MAP[slot.id].bossId && BPH_ENEMY_MAP[slot.id].kind === kind);
  return same.findIndex(slot => slot.id === id) + 1;
}
export function bphSlotPage(save: BphSave, slot: Slot, name: string, textId: CodexTextId | null,
  variants: readonly Slot[] = [slot]): BphCodexPage {
  const details = bphCodexDetails(slot.id), art = bphSlotArt(slot);
  if (slot.kind === "hero") {
    const profile = BPH_PROFILES[slot.id];
    const evolution = details.evolution.length ? [section(t("승급 계보"), evolutionList(slot.id))] : [];
    return {
      head: heading(art, t(name), sub(bphRarity(profile.rarity, true)), sub(t(BPH_CLASS_NAMES[profile.classId]))),
      body: [statList([details.stats]),
        ...(details.skills.length ? [section(t("고유 기술"), ...details.skills.map(skillCard))] : []),
        ...evolution, ...(textId ? [unitBackground(textId)] : []), discoveryReward(save, slot.id), classReward(save, profile.classId)],
    };
  }
  if (slot.kind === "tome") {
    return {
      head: heading(art, t(name), sub(bphRarity(BPH_TOMES[slot.id].rarity, true))),
      body: [section(t("책략 효과"), ...details.skills.map(skillCard)), discoveryReward(save, slot.id)],
    };
  }
  const enemy = BPH_ENEMY_MAP[slot.id], role = t(enemy.role.replace("Elite ", ""));
  const bio = textId ? bphBioLine(textId) : null;
  const rewards = variants.map(variant => {
    const reward = discoveryReward(save, variant.id);
    if (variants.length > 1) reward.prepend(el("span", "", `${t(name)} ${bphEnemyNumber(variant.id)}`));
    return reward;
  });
  return {
    head: heading(art, t(name), sub(bio ?? role), ...(bio ? [sub(role)] : [])),
    body: [statList(variants.map(variant => bphCodexDetails(variant.id).stats)),
      ...(textId ? historySections(textId) : []), ...rewards],
  };
}
function evolutionList(id: string): HTMLElement {
  const list = el("ol", "bph-codex-evolution"), start = el("li");
  start.append(el("strong", "", t(BPH_PROFILES[id].name)));
  list.append(start);
  for (const step of bphCodexDetails(id).evolution) {
    const item = el("li");
    item.append(el("strong", "", t(BPH_PROFILES[step.profileId]?.name ?? step.name)),
      el("span", "", tr`누적 ${step.kills}처치 · 처치 진급 ${step.requiredUnlockLevel}단계`));
    if (step.changesIdentity) item.append(el("span", "bph-codex-tag", t("새 병력으로 바뀜")));
    list.append(item);
  }
  return list;
}
export function bphGeneralPage(general: BphGeneral, textId: CodexTextId): BphCodexPage {
  const skill = bphCommanderSkill(general), bio = bphBioLine(textId);
  const card = el("div", "bph-skill-card"), title = el("strong");
  title.append(icon(skillIconFile(SKILL_ICONS[general])), t(skill.name));
  card.append(title, el("p", "", t(skill.line)), bphFactList(skill.facts));
  return {
    head: heading(bphGeneralArt(general), t(general), ...(bio ? [sub(bio)] : []), sub(t(BPH_CLASS_NAMES[BPH_GENERAL_CLASS[general]]))),
    body: [statList([[{ label: "체력", value: GENERAL_HP[general], unit: "" }]]), section(t("필살기"), card), ...historySections(textId)],
  };
}
export function bphHiddenPage(save: BphSave, slot: Slot | null, condition: string | null): BphCodexPage {
  const hint = slot === null ? tr`해금 조건: ${condition ?? ""}`
    : t(slot.kind === "enemy" ? "전투에서 처음 마주치면 기록됩니다." : "병력 모집이나 전투에서 처음 만나면 기록됩니다.");
  return {
    head: heading(BPH_CODEX_UNKNOWN, BPH_CODEX_UNKNOWN_NAME, sub(t(slot === null ? "미해금" : "미발견")), sub(hint)),
    body: slot ? [discoveryReward(save, slot.id)] : [],
  };
}

export function bphSummaryPage(save: BphSave): BphCodexPage {
  const view = bphCodexRewardView(save), { found, total } = bphCodexCompletion(save);
  const unread = bphCodexUnread(save);
  const head = el("header", "bph-codex-page-head bph-codex-summary-head"), title = el("div", "bph-codex-title");
  const bar = el("div", "bar"), fill = el("i");
  bar.setAttribute("role", "progressbar"); bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(total)); bar.setAttribute("aria-valuenow", String(found));
  bar.setAttribute("aria-label", t("수집 기록")); fill.style.width = `${found * 100 / total}%`; bar.append(fill);
  title.append(el("h2", "", t("수집 기록")), sub(tr`발견 ${found}/${total} · ${Math.floor(found * 100 / total)}%`), bar);
  head.append(title);
  const body: HTMLElement[] = [];
  if (unread || view.pendingGold) {
    const notice = el("p", "ribbon bph-codex-notice");
    notice.setAttribute("role", "status");
    const item = (picture: string, text: string) => {
      const group = el("span");
      group.append(icon(picture), text);
      return group;
    };
    if (unread) notice.append(item(pixelIcon("card"), tr`새 기록 ${unread}`));
    if (view.pendingGold) notice.append(item(pixelIcon("coin"), tr`다음 출전 때 금 +${view.pendingGold}`));
    body.push(notice);
  }
  const rule = el("p", "bph-codex-rule");
  rule.append(icon(pixelIcon("coin")), el("span", "", tr`새로 발견하면 금 ${BPH_CODEX_DISCOVERY_GOLD} · 장수는 기록만 남습니다`));
  const milestones = el("ul", "bph-codex-milestones");
  for (const cosmetic of BPH_CODEX_COSMETICS) {
    const item = el("li"), target = Math.ceil(total * cosmetic.percent / 100);
    item.append(icon(pixelIcon(cosmetic.id.startsWith("title") ? "trophy" : "fame")), el("strong", "", t(cosmetic.name)),
      el("span", "bph-codex-tally", `${Math.min(found, target)}/${target}`));
    if (claimedBy(save, cosmetic.id)) { item.classList.add("is-claimed"); item.append(icon(CHECK)); }
    milestones.append(item);
  }
  const classes = el("ul", "bph-codex-milestones");
  for (const { classId, label, art, found: seen, total: all } of bphCodexClassViews(save)) {
    const item = el("li");
    item.append(bphArtElement(art, true), el("strong", "", label), el("span", "bph-codex-tally", `${seen}/${all}`));
    if (claimedBy(save, `class:${classId}`)) { item.classList.add("is-claimed"); item.append(icon(CHECK)); }
    item.dataset.relic = BPH_CODEX_CLASS_REWARDS[classId];
    classes.append(item);
  }
  body.push(rule, section(t("달성 보상"), milestones),
    section(t("병종 완성 보상"), el("p", "", t("병종을 모두 발견하면 유물을 자동으로 받아요")), classes));
  return { head, body };
}
