/** Roster order is also the persistent barracks recruitment order. */
export const GENERALS = ["권율", "김시민", "곽재우", "황진", "처영", "조헌", "신립", "이복남",
  "정발", "송상현", "신각", "김명원", "김여물", "정담", "노개방", "영규", "이여송", "이정헌", "김희수", "송봉수"] as const;
/** The retained legacy roster is read only by old-save/combat compatibility code. */
export type General = typeof GENERALS[number] | "사명대사" | "이순신";
/** Distribution mode changes availability, never the full game's content data. */
export const DEMO_ROSTER = ["권율", "김시민", "곽재우", "황진", "처영", "조헌", "신립", "이복남"] as const satisfies readonly General[];
export const rosterFor = (search: URLSearchParams): readonly General[] => search.get("demo") === "1" ? DEMO_ROSTER : GENERALS;
export const PARTY_LIMIT = 4;
export const GENERAL_SCALE = 2;
export const SOLDIERS = ["spearman", "archer", "hwacha", "monk", "ming_cavalry"] as const;
export const ARMY_KINDS = [...SOLDIERS, "panokseon"] as const;
export type SoldierKind = typeof ARMY_KINDS[number];
export type Style = "guardian" | "hunter" | "frontline";
export const GENERAL_CLASS: Record<General, SoldierKind> = {
  사명대사: "monk", 이순신: "panokseon",
  권율: "archer", 김시민: "monk", 곽재우: "ming_cavalry", 황진: "spearman",
  처영: "monk", 조헌: "hwacha", 신립: "ming_cavalry", 이복남: "archer",
  정발: "spearman", 송상현: "archer", 신각: "spearman", 김명원: "hwacha", 김여물: "ming_cavalry", 정담: "spearman",
  노개방: "monk", 영규: "monk", 이여송: "ming_cavalry", 이정헌: "archer", 김희수: "hwacha", 송봉수: "spearman",
};
export const STYLES: Record<General, Style> = {
  사명대사: "frontline", 이순신: "guardian",
  권율: "guardian", 김시민: "frontline", 곽재우: "hunter", 황진: "frontline",
  처영: "frontline", 조헌: "guardian", 신립: "hunter", 이복남: "guardian",
  정발: "frontline", 송상현: "guardian", 신각: "hunter", 김명원: "guardian", 김여물: "hunter", 정담: "frontline",
  노개방: "guardian", 영규: "frontline", 이여송: "hunter", 이정헌: "guardian", 김희수: "guardian", 송봉수: "frontline",
};
export const GENERAL_ART: Record<General, string> = {
  사명대사: "samyeong", 이순신: "yi_sunsin",
  권율: "gwon_yul", 김시민: "kim_simin", 곽재우: "hero", 황진: "hwang_jin",
  처영: "cheo_yeong", 조헌: "jo_heon", 신립: "shin_rip", 이복남: "lee_boknam",
  정발: "jeong_bal", 송상현: "song_sanghyeon", 신각: "shin_gak", 김명원: "kim_myeongwon", 김여물: "kim_yeomul", 정담: "jeong_dam",
  노개방: "no_gaebang", 영규: "yeonggyu", 이여송: "li_rusong", 이정헌: "lee_jeongheon", 김희수: "kim_huisu", 송봉수: "song_bongsu",
};
/** Personal bodies are independent of the class of accompanying soldiers. */
export const generalUnit = (general: General): string => GENERAL_ART[general];
/** 곽재우 keeps the shared hero body on the field but shows a face of his own. */
export const generalPortrait = (general: General): string => general === "곽재우" ? "gwak_jaeu" : GENERAL_ART[general];
export const GENERAL_HP: Record<General, number> = {
  사명대사: 1400, 이순신: 1400,
  권율: 1100, 김시민: 1600, 곽재우: 1000, 황진: 1500, 처영: 1400, 조헌: 1050, 신립: 1150, 이복남: 1100,
  정발: 1500, 송상현: 1150, 신각: 1350, 김명원: 1100, 김여물: 1200, 정담: 1450,
  노개방: 1300, 영규: 1400, 이여송: 1200, 이정헌: 1100, 김희수: 1050, 송봉수: 1450,
};
export const COOLDOWNS: Record<General, number> = {
  사명대사: 12, 이순신: 12,
  권율: 8, 김시민: 12, 곽재우: 8, 황진: 10, 처영: 12, 조헌: 12, 신립: 10, 이복남: 10,
  정발: 10, 송상현: 9, 신각: 10, 김명원: 12, 김여물: 11, 정담: 9,
  노개방: 11, 영규: 12, 이여송: 12, 이정헌: 10, 김희수: 12, 송봉수: 10,
};
export const SKILL_NAMES: Record<General, string> = {
  사명대사: "치유 파동", 이순신: "거북선 돌진",
  권율: "일제사격", 김시민: "철벽", 곽재우: "의병 매복", 황진: "진각",
  처영: "치유 파동", 조헌: "집중 포격", 신립: "왕복 돌파", 이복남: "화살비",
  정발: "산성 돌격", 송상현: "동래성 사수", 신각: "해유령 격파", 김명원: "수성 포격", 김여물: "탄금 돌파", 정담: "웅치 진각",
  노개방: "동래 회복", 영규: "금산 파동", 이여송: "평양 돌파", 이정헌: "행주 화시", 김희수: "동래 집중포", 송봉수: "결사 진각",
};
type GeneralSkill =
  | { readonly kind: "hold" | "ambush" }
  | { readonly kind: "volley"; readonly radius: number; readonly power: number; readonly burn: number }
  | { readonly kind: "shield" }
  | { readonly kind: "charge"; readonly returns: boolean }
  | { readonly kind: "sweep"; readonly radius: number; readonly power: number; readonly stun: number }
  | { readonly kind: "heal"; readonly ratio: number }
  | { readonly kind: "bombard"; readonly radius: number; readonly power: number };
export const GENERAL_SKILLS: Record<General, GeneralSkill> = {
  사명대사: { kind: "heal", ratio: .3 }, 이순신: { kind: "charge", returns: false },
  권율: { kind: "volley", radius: 80, power: 5, burn: 0 },
  김시민: { kind: "shield" },
  곽재우: { kind: "ambush" },
  황진: { kind: "sweep", radius: 95, power: 4, stun: 2 },
  처영: { kind: "heal", ratio: .3 },
  조헌: { kind: "bombard", radius: 65, power: 7 },
  신립: { kind: "charge", returns: true },
  이복남: { kind: "volley", radius: 110, power: 3, burn: 5 },
  정발: { kind: "sweep", radius: 85, power: 4.5, stun: 1.4 },
  송상현: { kind: "hold" },
  신각: { kind: "sweep", radius: 75, power: 5, stun: 1 },
  김명원: { kind: "bombard", radius: 75, power: 6 },
  김여물: { kind: "charge", returns: false },
  정담: { kind: "sweep", radius: 90, power: 3.6, stun: 2 },
  노개방: { kind: "heal", ratio: .25 },
  영규: { kind: "sweep", radius: 95, power: 3.8, stun: 1.8 },
  이여송: { kind: "charge", returns: true },
  이정헌: { kind: "volley", radius: 95, power: 3.5, burn: 3 },
  김희수: { kind: "bombard", radius: 60, power: 6.5 },
  송봉수: { kind: "sweep", radius: 80, power: 4.2, stun: 1.6 },
};
export const AWAKENINGS: Record<General, { name: string; line: string }[]> = {
  사명대사: [{ name: "치유 강화", line: "치유량 증가" }, { name: "치유 연마", line: "충전 단축" }],
  이순신: [{ name: "함대 돌파", line: "거북선 돌진 강화" }, { name: "수군 연마", line: "충전 단축" }],
  권율: [{ name: "연발 사격", line: "일제사격이 두 번" }, { name: "빠른 장전", line: "일제사격 충전 절반" }],
  김시민: [{ name: "반격 철벽", line: "막은 피해를 되돌림" }, { name: "긴 철벽", line: "철벽 연장" }],
  곽재우: [{ name: "홍의 기세", line: "매복 뒤 공격 두 배" }, { name: "의병 매복", line: "매복 연마" }],
  황진: [{ name: "진각 강화", line: "진각 피해 강화" }, { name: "진각 연마", line: "진각 충전 단축" }],
  처영: [{ name: "치유 강화", line: "치유량 증가" }, { name: "치유 연마", line: "치유 충전 단축" }],
  조헌: [{ name: "포격 강화", line: "포격 피해 강화" }, { name: "포격 연마", line: "포격 충전 단축" }],
  신립: [{ name: "돌파 기세", line: "돌파 뒤 공격 두 배" }, { name: "돌파 연마", line: "돌파 충전 단축" }],
  이복남: [{ name: "화살비 강화", line: "화살비 피해 강화" }, { name: "화살비 연마", line: "화살비 충전 단축" }],
  정발: [{ name: "산성 돌격", line: "진격 강화" }, { name: "산성 돌격", line: "충전 단축" }],
  송상현: [{ name: "동래성 사수", line: "방어선 강화" }, { name: "동래성 사수", line: "충전 단축" }],
  신각: [{ name: "해유령 격파", line: "격파 강화" }, { name: "해유령 격파", line: "충전 단축" }],
  김명원: [{ name: "수성 포격", line: "포격 강화" }, { name: "수성 포격", line: "충전 단축" }],
  김여물: [{ name: "탄금 돌파", line: "돌파 강화" }, { name: "탄금 돌파", line: "왕복 돌파" }],
  정담: [{ name: "웅치 진각", line: "진각 강화" }, { name: "웅치 진각", line: "충전 단축" }],
  노개방: [{ name: "동래 회복", line: "회복 강화" }, { name: "동래 회복", line: "충전 단축" }],
  영규: [{ name: "금산 파동", line: "파동 강화" }, { name: "금산 파동", line: "충전 단축" }],
  이여송: [{ name: "평양 돌파", line: "돌파 강화" }, { name: "평양 돌파", line: "충전 단축" }],
  이정헌: [{ name: "행주 화시", line: "화시 강화" }, { name: "행주 화시", line: "충전 단축" }],
  김희수: [{ name: "동래 집중포", line: "집중포 강화" }, { name: "동래 집중포", line: "충전 단축" }],
  송봉수: [{ name: "결사 진각", line: "진각 강화" }, { name: "결사 진각", line: "충전 단축" }],
};
