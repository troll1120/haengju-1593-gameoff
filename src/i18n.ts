import { UI_ENGLISH } from "./i18n-ui";
import { normalizeKoreanDisplay } from "./display-text";
import { unitNameTranslation } from "./unit-codex-i18n";
export type Lang = "ko" | "en";
const STORE = "haengju1593-lang";
/** Legacy tooltip callers retain their source keys while displaying the current skill identity. */
const DISPLAY_COPY: Readonly<Record<string, string>> = {
  "5초간 성벽 앞 방어선을 세워 통과하는 적을 40% 느리게 하고 가벼운 피해를 줍니다.": "전장 여러 곳에 낙뢰가 반복해서 떨어져 적에게 피해를 줍니다.",
};
/** What the English screen shows for each Korean name the game is written in. A name missing here stays Korean. */
const ENGLISH: Readonly<Record<string, string>> = {
  "행주 1593": "Haengju 1593", 행주: "HAENGJU", 게임시작: "START",
  권율: "Gwon Yul", 김시민: "Kim Si-min", 곽재우: "Gwak Jae-u", 황진: "Hwang Jin", 처영: "Cheoyeong", 조헌: "Jo Heon", 신립: "Sin Rip", 이복남: "Yi Bok-nam",
  정발: "Jeong Bal", 송상현: "Song Sang-hyeon", 신각: "Sin Gak", 김명원: "Kim Myeong-won", 김여물: "Kim Yeo-mul", 정담: "Jeong Dam",
  노개방: "No Gae-bang", 영규: "Yeonggyu", 이여송: "Li Rusong", 이정헌: "Yi Jeong-heon", 김희수: "Kim Hui-su", 송봉수: "Song Bong-su",
  "산성 돌격": "Fortress Charge", "동래 사격": "Dongnae Volley", "해유령 격파": "Haeyu Strike", "수성 포격": "Fort Barrage",
  "탄금 돌파": "Tangeum Charge", "웅치 진각": "Ungchi Quake", "동래 회복": "Dongnae Heal", "금산 파동": "Geumsan Wave",
  "평양 돌파": "Pyongyang Charge", "행주 화시": "Haengju Fire Arrows", "동래 집중포": "Dongnae Barrage", "결사 진각": "Last Quake",
  창병: "Spearman", 궁수: "Archer", 화차병: "Rocketeer", 승병: "Monk", 기병: "Cavalry",
  궁병: "Bowmen", 화차: "Hwacha", "관통 화살": "Piercing", "큰 화약": "Gunpowder", 화공: "Wildfire", 배수진: "Last Stand", "시간 균열": "Time Rift",
  "연발 사격": "Twin Shot", "빠른 장전": "Fast Load", "반격 철벽": "Riposte", "긴 철벽": "Long Wall", "홍의 기세": "Red Fury", "왕복 돌격": "Twin Charge",
  "진각 강화": "Quake Power", "진각 연마": "Quake Haste", "치유 강화": "Heal Power", "치유 연마": "Heal Haste", "포격 강화": "Shell Power", "포격 연마": "Shell Haste",
  "돌파 기세": "Break Fury", "돌파 연마": "Break Haste", "화살비 강화": "Rain Power", "화살비 연마": "Rain Haste",
  천우시: "Arrow Rain", 빙결시: "Frostbolt", 장창진: "Pike Wall", 철산진: "Iron Peak", 금강파: "Vajra Blow", 회생진: "Revival", 신기전진: "Singijeon", 진천뢰: "Sky Thunder",
};
let current: Lang = "ko";
const tMemo = new Map<string, string>();
const trMemo = new Map<string, string>();
const trTemplates = new WeakMap<TemplateStringsArray, string>();
const memoCap = 4096;
function remember<K, V>(store: Map<K, V>, key: K, value: V): V {
  if (store.size >= memoCap) store.clear();
  store.set(key, value);
  return value;
}
function kept(): Lang | null {
  try {
    const lang = localStorage.getItem(STORE);
    return lang === "ko" || lang === "en" ? lang : null;
  } catch { return null; }
}
/** A fresh launch starts in English without saving it as an explicit preference. */
export function openIn(): Lang {
  applyLanguage(kept() ?? "en");
  return current;
}
export const language = (): Lang => current;
function applyLanguage(lang: Lang): void {
  current = lang;
  tMemo.clear(); trMemo.clear();
}
export function setLanguage(lang: Lang): void {
  applyLanguage(lang);
  try { localStorage.setItem(STORE, lang); } catch { return; }
}
export function t(source: string): string {
  const known = tMemo.get(source);
  if (known !== undefined) return known;
  const unitName = unitNameTranslation(source, current);
  if (unitName !== undefined) return remember(tMemo, source, unitName);
  const korean = DISPLAY_COPY[source] ?? source;
  if (current === "ko") return remember(tMemo, source, normalizeKoreanDisplay(korean));
  if (UI_ENGLISH[korean] !== undefined) return remember(tMemo, source, UI_ENGLISH[korean]);
  const key = korean.trim();
  const translated = UI_ENGLISH[key] ?? ENGLISH[key] ?? UI_ENGLISH[key.replaceAll("전술", "책략")];
  return remember(tMemo, source, translated === undefined ? korean : korean.replace(key, translated));
}
/** Translating the complete sentence lets English reorder values without changing game identities. */
export function tr(parts: TemplateStringsArray, ...values: readonly unknown[]): string {
  let key = trTemplates.get(parts);
  if (key === undefined) {
    key = parts.reduce((text, part, index) => text + (index ? `{${index - 1}}` : "") + part, "");
    trTemplates.set(parts, key);
  }
  const memoKey = key + "\u0000" + values.map(value => typeof value === "string" ? value : String(value)).join("\u0001");
  const cached = trMemo.get(memoKey);
  if (cached !== undefined) return cached;
  const template = current === "ko" ? key : UI_ENGLISH[key] ?? key;
  const rendered = template.replace(/\{(\d+)\}/g, (_, index: string) => {
    const value = values[Number(index)];
    return typeof value === "string" ? t(value) : String(value);
  });
  return remember(trMemo, memoKey, current === "ko" ? t(rendered) : rendered);
}
