import { shownAmount } from "./display-scale";
import { language, t, tr } from "./i18n";
import { BPH_CODEX_TEXT, BPH_GENERAL_TEXT } from "./bph-codex-data";
import type { CodexTextId } from "./bph-codex-data";
import { BPH_GENERALS } from "./bph-commanders";
import type { BphGeneral } from "./bph-commanders";
import { pixelIcon } from "./icons";
import type { IconName } from "./icons";
import { COOLDOWNS, generalPortrait, GENERAL_SKILLS, SKILL_NAMES } from "./roster";
import { BALANCE } from "./rules";
import { UNIQUE_SKILL_DESCRIPTIONS } from "./skills-unique";
import { SKILL_ICONS, skillIconFile } from "./card-art";
import { bphCommandLine } from "./bph-general-command";

export type BphFact = { readonly icon: IconName; readonly label: string; readonly value: string };

/** Verified biography text exists only in Korean; the English screen keeps the parts it can read. */
const readable = (text: string): boolean => language() === "ko" || !/[가-힣]/.test(text);

export function bphBioLine(id: CodexTextId): string | null {
  const text = BPH_CODEX_TEXT[id];
  if ("text" in text) return null;
  return [text.side === "japan" ? "일본" : text.side, text.years, text.title]
    .map(part => t(part)).filter(readable).join(" · ");
}

export function bphFactList(facts: readonly BphFact[]): HTMLElement {
  const list = document.createElement("dl");
  list.className = "bph-facts";
  for (const fact of facts) {
    const row = document.createElement("div"), name = document.createElement("dt"), value = document.createElement("dd");
    const picture = document.createElement("img");
    picture.src = pixelIcon(fact.icon); picture.alt = "";
    name.append(picture, t(fact.label)); value.textContent = fact.value;
    row.append(name, value); list.append(row);
  }
  return list;
}

const SKILL_LINES = {
  volley: "조준한 곳 주변의 적을 한꺼번에 쏜다", bombard: "조준한 곳을 포격한다",
  sweep: "주변의 적을 휩쓸고 기절시킨다", heal: "모든 아군의 체력을 회복한다",
  shield: "성벽에 보호막을 두르고 붙은 적을 밀어낸다",
  charge: "적진을 일직선으로 돌파한다", "charge-return": "적진을 돌파했다가 되돌아온다",
  hold: UNIQUE_SKILL_DESCRIPTIONS.송상현 ?? "",
  ambush: UNIQUE_SKILL_DESCRIPTIONS.곽재우 ?? "",
} as const;

const HIDDEN_DAMAGE = new Set(["피해", "선박 피해"]);
/** Base values the battle rules read for this commander; awakenings and levels scale them in battle. */
export function bphCommanderSkill(general: BphGeneral): { readonly name: string; readonly line: string; readonly facts: readonly BphFact[] } {
  const skill = GENERAL_SKILLS[general], seconds = (value: number) => tr`${value}초`;
  const facts: BphFact[] = [{ icon: "hourglass", label: "재사용", value: seconds(COOLDOWNS[general]) }];
  // Replacement skills use qualitative copy until their runtime quantities are final.
  switch (general) {
    case "송상현": return { name: SKILL_NAMES[general], line: "전장 여러 곳에 낙뢰가 반복해서 떨어져 적에게 피해를 줍니다.", facts };
    case "김시민": return { name: SKILL_NAMES[general], line: "성벽의 현자총통이 포탄을 발사합니다. 적 사이에서 일어난 폭발이 피해를 주고 적을 밀쳐냅니다.", facts };
    case "사명대사": return { name: SKILL_NAMES[general], line: "범종을 울려 전장 전체의 적에게 피해를 주고 잠깐 기절시킵니다.", facts };
  }
  const damage = (value: number): BphFact => ({ icon: "sword", label: "피해", value: String(shownAmount(value)) });
  const area = (value: number): BphFact => ({ icon: "motion", label: "범위", value: String(value) });
  const stun = (value: number): BphFact => ({ icon: "flash", label: "기절", value: seconds(value) });
  switch (skill.kind) {
    case "volley":
      facts.push(damage(skill.power), area(skill.radius));
      if (skill.burn > 0) facts.push({ icon: "skill-up", label: "화상", value: seconds(skill.burn) });
      break;
    case "bombard": facts.push(damage(skill.power), area(skill.radius)); break;
    case "sweep": facts.push(damage(skill.power), area(skill.radius), stun(skill.stun)); break;
    case "heal": facts.push({ icon: "heart", label: "회복", value: `${Math.round(skill.ratio * 100)}%` }); break;
    case "shield": facts.push({ icon: "skill-shield", label: "지속", value: seconds(BALANCE.shieldSeconds) }); break;
    case "charge":
      if (general === "이순신") {
        facts.push(damage(Number((.6083 * BALANCE.cooldown.이순신).toFixed(4))),
          { icon: "sword", label: "선박 피해", value: String(shownAmount(300)) }, area(48));
      } else facts.push(damage(BALANCE.chargePower), { icon: "pierce", label: "최대 거리", value: String(BALANCE.chargeReach) }, stun(BALANCE.chargeStun));
      break;
    case "hold":
      facts.push({ icon: "hourglass", label: "지속", value: seconds(5) },
        { icon: "motion", label: "길이", value: "144" }, damage(1.08));
      break;
    case "ambush":
      facts.push({ icon: "hourglass", label: "지속", value: seconds(3) },
        { icon: "heart", label: "소환 수", value: "4" }, damage(.7), stun(1));
      break;
  }
  const line = general === "이순신" ? "지상 적을 휩쓸고 수송선에 피해를 줍니다."
    : skill.kind === "charge" && skill.returns ? SKILL_LINES["charge-return"] : SKILL_LINES[skill.kind];
  // Owner rule: cards never print how hard an ultimate hits; the battle shows it.
  return { name: SKILL_NAMES[general], line, facts: facts.filter(fact => !HIDDEN_DAMAGE.has(fact.label)) };
}

export function renderBphCommanderInfo(general: BphGeneral): HTMLElement {
  const info = document.createElement("section"), face = document.createElement("img");
  info.className = "bph-commander-info"; info.dataset.general = general;
  info.setAttribute("aria-label", t(tr`${general} 정보`));
  face.className = "bph-commander-face"; face.src = `./art/portraits/${generalPortrait(general)}.png`; face.alt = "";
  const identity = document.createElement("div"), name = document.createElement("strong");
  identity.className = "bph-commander-id"; name.textContent = t(general); identity.append(name);
  const bio = bphBioLine(BPH_GENERAL_TEXT[BPH_GENERALS.indexOf(general)]);
  if (bio) { const line = document.createElement("p"); line.textContent = bio; identity.append(line); }
  const skill = bphCommanderSkill(general), card = document.createElement("div");
  const title = document.createElement("strong"), picture = document.createElement("img"), line = document.createElement("p");
  card.className = "bph-skill-card";
  picture.src = skillIconFile(SKILL_ICONS[general]); picture.alt = "";
  title.append(picture, t(skill.name)); line.textContent = t(skill.line);
  // Preparation shows who the commander is and what the skill does, never its numbers (owner rule).
  const command = document.createElement("p");
  command.className = "bph-command-line";
  const lang = language();
  command.textContent = `${lang === "ko" ? "지휘" : "Command"} · ${bphCommandLine(general, lang)}`;
  card.append(title, line, command);
  info.append(face, identity, card);
  return info;
}
