import { t } from "./i18n";
import { pixelIcon } from "./icons";
import "./first-battle-guide.css";

const STEPS = [
  {
    title: "지휘", icon: "touch",
    body: "병력은 자동으로 이동하고 공격합니다. 전장을 누르거나 포인터를 옮기면 지휘 효과가 향할 위치를 정합니다.",
  },
  {
    title: "모집", icon: "reinforce",
    body: "병력 모집 버튼에 표시된 코인을 지불하면 꾸러미를 엽니다. 전장에 남은 꾸러미는 두 번 눌러 개봉합니다.",
  },
  {
    title: "필살기", icon: "skill-up",
    body: "하단 장수 버튼의 충전이 끝나면 눌러 필살기를 씁니다. 사용한 뒤에는 다시 충전될 때까지 기다립니다.",
  },
  {
    title: "성 방어", icon: "shield",
    body: "내성을 지키며 보스를 격파하고 남은 적을 없애면 승리합니다. 내성 체력이 모두 소진되면 패배합니다.",
  },
] as const;

/** Native modal focus and inertness keep every real battle control out of reach. */
export function showFirstBattleGuide(onComplete: () => void): void {
  const dialog = document.createElement("dialog");
  dialog.id = "first-battle-guide";
  dialog.className = "panel first-battle-guide";
  dialog.setAttribute("aria-labelledby", "first-guide-heading");
  dialog.setAttribute("aria-describedby", "first-guide-body first-guide-paused");
  const progress = document.createElement("p"), heading = document.createElement("h2");
  const icon = document.createElement("img"), body = document.createElement("p");
  const paused = document.createElement("p"), actions = document.createElement("div");
  const skip = document.createElement("button"), next = document.createElement("button");
  heading.id = "first-guide-heading"; body.id = "first-guide-body";
  paused.id = "first-guide-paused"; paused.textContent = t("안내 중에는 전투가 멈춥니다.");
  icon.alt = "";
  progress.className = "first-guide-progress";
  actions.className = "first-guide-actions";
  skip.id = "first-guide-skip"; skip.type = "button"; skip.className = "menu-button";
  skip.textContent = t("건너뛰기");
  next.id = "first-guide-next"; next.type = "button"; next.className = "menu-button primary";
  next.autofocus = true;
  let step = 0;
  const render = () => {
    const content = STEPS[step];
    if (!content) return;
    dialog.dataset.step = String(step + 1);
    progress.textContent = `${t("첫 전투 안내")} · ${step + 1}/${STEPS.length}`;
    heading.textContent = t(content.title); body.textContent = t(content.body);
    icon.src = pixelIcon(content.icon);
    next.textContent = t(step === STEPS.length - 1 ? "안내 완료 · 전투 시작" : "다음");
  };
  const complete = () => {
    if (!dialog.open) return;
    dialog.close(); dialog.remove(); onComplete();
  };
  next.addEventListener("click", () => {
    if (step === STEPS.length - 1) { complete(); return; }
    step++; render();
  });
  skip.addEventListener("click", complete);
  dialog.addEventListener("cancel", event => { event.preventDefault(); complete(); });
  actions.append(skip, next);
  dialog.append(progress, icon, heading, body, paused, actions);
  document.body.append(dialog); render(); dialog.showModal();
}
