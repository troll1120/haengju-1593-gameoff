import type { BphClass } from "./bph-contract";

export const BPH_GENERALS = ["권율", "신립", "송상현", "황진", "김시민", "곽재우", "사명대사", "이순신"] as const;
export type BphGeneral = typeof BPH_GENERALS[number];
export const BPH_GENERAL_CLASS: Readonly<Record<BphGeneral, BphClass>> = {
  권율: "hwacha", 신립: "joseon_cavalry", 송상현: "archer", 황진: "spearman",
  김시민: "chongtong", 곽재우: "militia", 사명대사: "monk", 이순신: "panokseon",
};
