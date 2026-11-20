import { GENERALS } from "./roster";
import type { General, SoldierKind } from "./roster";
import type { IconName } from "./icons";

export type MetaNode = {
  readonly id: string; readonly branch: string; readonly name: string; readonly effect: string;
  readonly art: string | { readonly icon: IconName }; readonly cost: number; readonly requires: readonly string[];
  readonly group: string; readonly rank: number; readonly spine?: boolean;
};
const node = (id: string, branch: string, name: string, effect: string, cost: number, requires: readonly string[] = [], art: MetaNode["art"] = "icons/png-terrain_fort.webp", group = id, rank = 1): MetaNode =>
  ({ id, branch, name, effect, cost, requires, art, group, rank });
const spineRows: readonly (readonly [string, string, string, string, number, string?])[] = [
  ["troops8", "보급", "병사 상한 8", "병사를 8명까지", 40],
  ["party2", "본성", "본성 2단계", "장수 2명이 함께", 50],
  ["bow", "성", "성벽 궁병", "성벽 궁병 카드 해금", 90],
  ["troops12", "보급", "병사 상한 12", "병사를 12명까지", 120, "troops8"],
  ["forge", "대장간", "대장간", "병과 별 2 해금", 150],
  ["party3", "본성", "본성 3단계", "장수 3명·둘째 고리", 230, "party2"],
  ["cannon", "성", "성벽 화차", "성벽 화차 카드 해금", 320, "bow"],
  ["troops18", "보급", "병사 상한 18", "병사를 18명까지", 380, "troops12"],
  ["hero2", "장수", "장수 별 2", "첫 각성 카드 해금", 450],
  ["weapon2", "성", "성벽 무기 2레벨", "성벽 무기 상한 2", 520, "cannon"],
  ["party4", "본성", "본성 4단계", "장수 4명·셋째 고리", 610, "party3"],
  ["troops26", "보급", "병사 상한 26", "병사를 26명까지", 630, "troops18"],
  ["recruit3", "대장간", "병사 증원", "카드·상자 병사 3명", 650, "forge"],
  ["weapon3", "성", "성벽 무기 3레벨", "성벽 무기 상한 3", 670, "weapon2"],
  ["hero3", "장수", "장수 별 3", "둘째 각성 카드 해금", 680, "hero2"],
  ["troops36", "보급", "병사 상한 36", "병사를 36명까지", 700, "troops26"],
  ["forge3", "대장간", "대장간 증축", "병과 별 3 해금", 720, "recruit3"],
  ["storm", "대장간", "전설 공격형", "공격형 전설 카드", 740, "forge3"],
  ["evolution", "성", "무기 진화", "상자에서 무기 진화", 760, "weapon3"],
  ["troops48", "보급", "병사 상한 48", "병사를 48명까지", 770, "troops36"],
  ["guard", "대장간", "전설 수비형", "수비형 전설 카드", 810, "storm"],
];
export const CLASS_BRANCHES: readonly (readonly [SoldierKind, string, string, string, string])[] = [
  ["archer", "궁수", "연사", "불화살", "명궁"],
  ["spearman", "창병", "긴 창", "방패진", "창술"],
  ["monk", "승병", "큰 법장", "호법", "금강"],
  ["ming_cavalry", "기병", "돌파", "철갑", "기창"],
  ["hwacha", "화차병", "넓은 폭발", "연발 로켓", "화약 장인"],
];
const ranks = (id: string, branch: string, name: string, effect: string, art: MetaNode["art"]): MetaNode[] =>
  [40, 250, 470].map((cost, index) => node(`${id}${index + 1}`, branch, name, effect, cost,
    [...(index ? [`${id}${index}`] : []), ...(index === 1 ? ["party3"] : index === 2 ? ["party4"] : [])], art, id, index + 1));
export const TREE_NODES: readonly MetaNode[] = [
  ...spineRows.map(([id, branch, name, effect, cost, parent]) => ({ ...node(id, branch, name, effect, cost, parent ? [parent] : [],
    branch === "보급" ? { icon: "unit-cap" } : branch === "장수" ? "portraits/gwon_yul.png" : branch === "대장간" ? "icons/png-attack.webp" : branch === "성" ? id === "bow" ? { icon: "wall-archer" } : id === "cannon" ? { icon: "wall-hwacha" } : "icons/png-terrain_wall.webp" : "icons/png-terrain_fort.webp"), spine: true })),
  node("keep5", "본성", "본성 5단계", "전군 피해 ×1.25", 630, ["party4"]),
  node("keep6", "본성", "본성 6단계", "전군 피해 ×1.25", 900, ["keep5"]),
  ...ranks("charge", "장수", "빠른 충전", "충전 ×1.077씩", "fx/volley_arc.png"),
  ...ranks("body", "장수", "굳센 몸", "장수 체력 ×1.119씩", "portraits/kim_simin.png"),
  ...ranks("skill", "장수", "강한 필살기", "필살기 ×1.145씩", "fx/blast_big.png"),
  ...ranks("basic", "장수", "명장", "장수 평타 ×1.145씩", "portraits/gwon_yul.png"),
  ...ranks("wall", "성", "성벽 보강", "성·본성 체력 ×1.119씩", "props/wall_ew_a.png"),
  node("startBow", "성", "궁병 배치", "궁병 1레벨로 시작", 180, ["bow"], { icon: "wall-archer" }),
  node("startCannon", "성", "화차 배치", "화차 1레벨로 시작", 360, ["cannon", "party3"], { icon: "wall-hwacha" }),
  node("startFire", "성", "화공", "성벽 무기에 화공", 500, ["startCannon", "party4"], "anim/fire_blaze.png"),
  node("purse", "보급", "군자금", "시작 골드 +150", 50, [], { icon: "coin" }),
  ...ranks("loot", "보급", "전리품", "처치 골드 +10%씩 합산", { icon: "coin" }),
  node("reserve", "보급", "예비대", "시작 병사 +1", 70, [], { icon: "reserve" }),
  node("reinforce", "보급", "증원군", "시작 병사 +1 더", 320, ["reserve", "party3"], { icon: "reinforce" }),
  ...CLASS_BRANCHES.flatMap(([kind, branch, shape, second, power]) => [
    node(`${kind}-shape`, branch, shape, kind === "hwacha" ? "폭발 범위 ×1.5" : kind === "archer" ? "화살 +1발" : "동시 타격 +1명", 50, [], `units/${kind}.png`),
    node(`${kind}-second`, branch, second, kind === "hwacha" ? "로켓 +1발" : kind === "archer" ? "화살이 3초 불태움" : "받는 피해 ×0.67", 270, [`${kind}-shape`, "party3"], `units/${kind}.png`),
    ...ranks(`${kind}-power`, branch, power, "병과 피해 ×1.145씩", `units/${kind}.png`),
  ]),
];
export const GENERAL_NODES: readonly MetaNode[] = GENERALS.flatMap((general, index) => {
  const art = `portraits/${["gwon_yul", "kim_simin", "hero", "hwang_jin", "cheo_yeong", "jo_heon", "shin_rip", "lee_boknam", "jeong_bal", "song_sanghyeon", "shin_gak", "kim_myeongwon", "kim_yeomul", "jeong_dam", "no_gaebang", "yeonggyu", "li_rusong", "lee_jeongheon", "kim_huisu", "song_bongsu"][index]}.png`;
  return [
    node(`master-${general}`, "장수 수련", `${general} 숙련`, "체력·평타 ×1.2", 150, [], art),
    node(`awake-${general}`, "장수 수련", `${general} 선점`, "별 2로 합류", 300, [`master-${general}`, "hero2"], art),
  ];
});
export const HIDDEN_NODES: readonly MetaNode[] = [
  node("militia1", "의병", "의병 I", "최저 군공 70", 60),
  node("militia2", "의병", "의병 II", "최저 군공 100", 150, ["militia1"]),
  node("militia3", "의병", "의병 III", "시작 성벽 체력 ×1.2", 300, ["militia2"]),
  node("navy", "수군", "판옥선 해금", "판옥선 카드 해금", 300, [], "ships/panokseon.png"),
  node("navy2", "수군", "함대 배치", "판옥선 2척으로 시작", 500, ["navy"], "ships/panokseon.png"),
  ...[40, 280, 520].map((cost, i) => node(`navyPower${i + 1}`, "수군", "함포 강화", "함포 피해 ×1.145씩", cost, [i ? `navyPower${i}` : "navy"], "ships/panokseon.png", "navyPower", i + 1)),
  node("turtle", "수군", "거북선", "함대 1척을 거북선으로", 600, ["navy2"], "ships/geobukseon.png"),
  ...CLASS_BRANCHES.map(([kind, branch]) => node(`inherit-${kind}`, "전설 계승", `${branch} 계승`, "전설 공격형으로 시작", 800, ["guard", `${kind}-second`, `${kind}-power3`], `units/${kind}.png`)),
  node("endless", "왕도", "무한 모드", "끝없는 전투 해금", 0),
  node("keep7", "왕도", "본성 7단계", "전군 피해 ×1.25", 1500, ["keep6", "endless"]),
];
export const META_NODES: readonly MetaNode[] = [...TREE_NODES, ...GENERAL_NODES, ...HIDDEN_NODES];
export type Personal = Partial<Record<General, boolean>>;
