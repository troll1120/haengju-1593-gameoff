import type { BphSave } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import { bphIntrinsicFoilEffects } from "./bph-fx-profiles";
import { language, t, tr } from "./i18n";
import { unitDisplayName } from "./unit-codex-i18n";
import "./bph-foil-tooltip.css";

const STATS: Readonly<Record<string, string>> = {
  FoilHeroHp: "체력", FoilHeroAttackPower: "공격력", FoilHeroAttackSpeed: "공격 속도",
  HeroAttackRange: "공격 거리", HeroAreaAttack: "공격 범위", HeroMoveSpeed: "이동 속도",
};
/** Consumes presentation state only. Discovery is recorded by the seeded draw, never by this hint.
 *  A seen flag from before the reveal-close trigger (no foilHintVersion) re-arms once (owner DM 1794926405): those
 *  accounts could never see the hint again, because the old trigger needed a foil soldier on the current field. */
export function takeBphFoilTooltip(save: BphSave) {
  if (save.foilTooltipSeen && save.foilHintVersion === 1) return null;
  const profileId = save.foils.find(id => BPH_PROFILES[id]);
  if (!profileId) return null;
  const bonuses = bphIntrinsicFoilEffects(profileId).flatMap(effect => {
    const label = STATS[effect.type];
    return label ? [tr`${t(label)} ×${Number((1 + effect.value).toFixed(4))}`] : [];
  });
  save.foilTooltipSeen = true; save.foilHintVersion = 1;
  return { profileId, bonuses };
}

/** A small toast at the top of the play column (owner DM 1794929475: never a modal): the battle keeps running, it fades on its own or on a tap, and the tap never reaches the field. */
export function showBphFoilTooltip(host: HTMLElement, hint: NonNullable<ReturnType<typeof takeBphFoilTooltip>>): void {
  document.getElementById("bph-foil-tooltip")?.remove();
  const toast = document.createElement("div"), title = document.createElement("strong"), name = document.createElement("span"), stats = document.createElement("span");
  toast.id = "bph-foil-tooltip"; toast.className = "bph-foil-tooltip"; toast.setAttribute("role", "status");
  title.textContent = t("무지개 판!");
  name.textContent = unitDisplayName(hint.profileId, language()) ?? t(BPH_PROFILES[hint.profileId].name);
  stats.textContent = hint.bonuses.join(" · ");
  const close = () => { clearTimeout(timer); toast.remove(); };
  const timer = setTimeout(close, 6000);
  for (const type of ["pointerdown", "click"] as const) toast.addEventListener(type, event => {
    event.stopPropagation(); event.preventDefault();
    if (type === "click") close();
  });
  toast.append(title, name, stats); host.append(toast);
}
