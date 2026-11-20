// Preview-only test bench drawer. main.ts loads this chunk only when CASTLE_SANDBOX_PREVIEW is built in and `?sandbox=1`.
import type { Meta } from "../meta";
import type { BphGeneral } from "../bph-commanders";
import { BPH_GENERALS } from "../bph-commanders";
import { bphArms } from "../bph-combat";
import { BPH_PROFILES, BPH_TOMES } from "../bph-data";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES, prepareBphUpgrades } from "../bph-upgrades";
import { upgradeName } from "../bph-upgrade-presentation";
import { bphEnemyMapping } from "../bph-waves";
import { HEIGHT, SIDES, WIDTH } from "../geometry";
import type { Direction } from "../geometry";
import { language, setLanguage, t } from "../i18n";
import type { Effect, Run } from "../rules";
import { benchAdvance, benchRun, benchStats, CHAPTERS, chaosLevel, chapterEnemies, clearEnemies, ENEMY_IDS, fireSkill,
  freshClock, isBoss, presetPlacements, setChaosLevel, spawnEnemies, spawnProfiles, TOME_IDS, UNIT_IDS, upgradePlacements } from "./bench";
import type { BenchClock, UpgradePreset } from "./bench";

export type SandboxHost = {
  readonly meta: Meta;
  run(): Run | null;
  install(make: () => Run): void;
  fire(squad: number): void;
};
export type Sandbox = { advance(run: Run, seconds: number): Effect[] };

const WORDS = {
  title: ["시험장", "Sandbox"], open: ["시험장", "Bench"], close: ["닫기", "Close"],
  units: ["병력", "Troops"], tactics: ["전술", "Tactics"], general: ["장수", "General"],
  upgrades: ["업그레이드", "Upgrades"], enemies: ["적군", "Enemies"], control: ["제어", "Control"],
  unit: ["병종", "Unit"], count: ["수량", "Count"], spawnGate: ["성문 앞에 소환", "Spawn at gate"],
  ranges: ["사거리 원", "Range circles"], onField: ["전장 병력", "On field"], none: ["없음", "None"],
  activate: ["지금 발동", "Activate now"], tomesActive: ["발동 중", "Active"],
  restartNote: ["바꾸면 판을 다시 시작합니다", "Changing restarts the battle"],
  chaos: ["혼돈 레벨", "Chaos level"], chaosApply: ["혼돈 적용", "Apply chaos"], chaosNow: ["현재 혼돈", "Current chaos"],
  skill: ["스킬 지금 발동", "Fire skill now"], skillCast: ["스킬 발동함", "Skill fired"],
  skillMissed: ["발동 안 됨: 대상이나 길이 없음", "Not fired: no target or path"], invincible: ["장수 무적", "Invincible general"],
  presetNone: ["없음", "None"], presetTypical: ["보통", "Typical"], presetFull: ["전부", "Full"], presetCustom: ["직접", "Custom"],
  gold: ["금화", "Gold"], search: ["노드 검색", "Search nodes"], selected: ["선택", "Selected"],
  applyRestart: ["적용하고 다시 시작", "Apply and restart"], chapter: ["장", "Chapter"],
  enemy: ["적 종류", "Enemy type"], filterChapter: ["이 장 적만", "This chapter only"], side: ["방향", "Side"],
  spawnEnemy: ["적 소환", "Spawn enemies"], holdWaves: ["웨이브 멈춤", "Hold waves"], clear: ["적 모두 제거", "Clear enemies"],
  pause: ["멈춤", "Pause"], resume: ["계속", "Resume"], step: ["한 틱", "+1 tick"], reset: ["리셋", "Reset"],
  castle: ["성 무적", "Invincible castle"], time: ["시간", "Time"], allyHp: ["아군 HP", "Ally HP"],
  dealt: ["준 피해", "Damage dealt"], dps: ["DPS", "DPS"], kills: ["처치", "Kills"], foes: ["적 수", "Enemies"],
  base: ["성 HP", "Castle HP"], blocked: ["저장 차단", "Saves blocked"], boss: ["보스", "Boss"],
  saveNote: ["시험장 판은 저장되지 않습니다", "Nothing in the sandbox is saved"],
} as const;
type Word = keyof typeof WORDS;
const say = (word: Word) => WORDS[word][language() === "ko" ? 0 : 1];
const SIDE_NAMES: Record<Direction, readonly [string, string]> = { 위: ["위", "Top"], 좌: ["왼쪽", "Left"], 우: ["오른쪽", "Right"], 아래: ["아래", "Bottom"] };
const TABS = ["units", "tactics", "general", "upgrades", "enemies", "control"] as const;
type Tab = typeof TABS[number];

const unitLabel = (id: string) => `${t(BPH_PROFILES[id]?.name ?? id)} · ${id}`;
const tomeLabel = (id: string) => `${t(BPH_TOMES[id]?.name ?? id)}`;
const enemyLabel = (id: string) => `${isBoss(id) ? `[${say("boss")}] ` : ""}${t(bphEnemyMapping(id)?.role ?? "")} · ${id}`;
const placementLabel = (id: string) => {
  const nodeId = BPH_PLACEMENTS.get(id)?.nodeId, node = nodeId ? BPH_UPGRADE_NODES[nodeId] : undefined;
  return node ? `${upgradeName(node)} · ${id}` : id;
};

const STYLE = `
.sbx-toggle { position: fixed; left: 8px; top: 50%; z-index: 60; min-width: 56px; min-height: 48px; border-radius: 12px; border: 2px solid #f2d27a; background: #2a1d14; color: #f7e6b5; font: 700 15px/1 system-ui, sans-serif; }
.sbx { position: fixed; z-index: 61; display: flex; flex-direction: column; background: rgba(24, 18, 14, .96); color: #f6ead0; font: 15px/1.35 system-ui, sans-serif; box-shadow: 0 0 0 2px #6b4a2a, 0 8px 28px rgba(0,0,0,.5); }
.sbx[hidden] { display: none; }
.sbx { left: 0; right: 0; bottom: 0; height: 55vh; border-radius: 14px 14px 0 0; }
@media (min-width: 900px) { .sbx { left: auto; top: 0; right: 0; bottom: 0; width: 400px; height: auto; border-radius: 0; } }
.sbx header { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid #5a4028; }
.sbx header b { flex: 1; font-size: 16px; }
.sbx button, .sbx select, .sbx input[type=number], .sbx input[type=search] { min-height: 44px; min-width: 44px; border-radius: 10px; border: 1px solid #8a6a40; background: #3a2a1c; color: #f6ead0; font: inherit; padding: 0 10px; }
.sbx button[aria-pressed=true] { background: #b8862e; color: #1d140c; border-color: #f2d27a; font-weight: 700; }
.sbx button:active { filter: brightness(1.25); }
.sbx select { width: 100%; height: 44px; -webkit-appearance: none; appearance: none; }
.sbx .sbx-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 2px 8px; padding: 4px 8px; font: 12px/1.3 ui-monospace, monospace; border-bottom: 1px solid #5a4028; }
.sbx .sbx-stats span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sbx .sbx-quick { display: flex; gap: 4px; padding: 6px 8px; overflow-x: auto; border-bottom: 1px solid #5a4028; }
.sbx .sbx-tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 8px; border-bottom: 1px solid #5a4028; }
.sbx .sbx-tabs button { flex: 1 0 auto; }
.sbx .sbx-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; -webkit-overflow-scrolling: touch; }
.sbx .sbx-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sbx .sbx-row > label { min-width: 72px; color: #e6c983; }
.sbx .sbx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.sbx .sbx-grid button { text-align: left; padding: 6px 10px; }
.sbx .sbx-note { font-size: 12px; color: #c9b48a; }
.sbx .sbx-list { display: flex; flex-direction: column; gap: 2px; max-height: 40vh; overflow-y: auto; }
.sbx .sbx-list label { display: flex; align-items: center; gap: 8px; min-height: 44px; font-size: 13px; }
.sbx .sbx-list input { width: 22px; height: 22px; }
.sbx input[type=range] { flex: 1; min-height: 44px; }
.sbx-ranges { position: fixed; pointer-events: none; z-index: 59; }
`;

type Setup = { general: BphGeneral; chapter: number; preset: UpgradePreset; custom: Set<string>; gold: number; seed: number; chaos: number | null };

export function mountSandbox(host: SandboxHost): Sandbox {
  let blocked = 0;
  const write = Storage.prototype.setItem;
  Storage.prototype.setItem = function (this: Storage, key: string, value: string): void {
    if (this === window.localStorage) { blocked++; return; }
    write.call(this, key, value);
  };
  const setup: Setup = { general: "권율", chapter: 1, preset: "none", custom: new Set(), gold: 500, seed: 1593, chaos: null };
  let clock: BenchClock = freshClock();
  let tab: Tab = "units", showRanges = false, onlyChapter = true, query = "", skillNote: Word | null = null;
  const pick = { unit: UNIT_IDS[0], unitCount: 1, enemy: "", enemyCount: 5, side: "위" as Direction, chaos: 0 };

  const style = document.createElement("style"); style.textContent = STYLE; document.head.append(style);
  const toggle = document.createElement("button"); toggle.className = "sbx-toggle"; toggle.type = "button";
  const drawer = document.createElement("aside"); drawer.className = "sbx";
  const ranges = document.createElement("canvas"); ranges.className = "sbx-ranges";
  document.body.append(ranges, drawer, toggle);
  toggle.addEventListener("click", () => { drawer.hidden = !drawer.hidden; render(); });

  const current = () => host.run();
  function restart(): void {
    const placements = setup.preset === "custom" ? [...setup.custom] : presetPlacements(setup.preset);
    host.install(() => benchRun(host.meta, { general: setup.general, chapter: setup.chapter, placements, gold: setup.gold, seed: setup.seed }));
    const { paused, speed, wavesHeld, generalInvincible, castleInvincible } = clock;
    clock = { ...freshClock(), paused, speed, wavesHeld, generalInvincible, castleInvincible };
    const run = current();
    if (run && setup.chaos !== null) setChaosLevel(run, setup.chaos);
    pick.chaos = run ? chaosLevel(run) : 0;
    render();
  }

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { pressed?: boolean } = {},
    ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    const { pressed, ...rest } = props;
    Object.assign(node, rest);
    if (tag === "button") (node as HTMLButtonElement).type = "button";
    if (pressed !== undefined) node.setAttribute("aria-pressed", String(pressed));
    node.append(...children);
    return node;
  }
  const button = (text: string, act: () => void, pressed?: boolean) => {
    const node = el("button", pressed === undefined ? {} : { pressed }, text);
    node.addEventListener("click", () => { act(); render(); });
    return node;
  };
  const row = (label: string, ...children: Node[]) => el("div", { className: "sbx-row" }, ...(label ? [el("label", {}, label)] : []), ...children);
  const select = (options: readonly string[], value: string, label: (id: string) => string, change: (id: string) => void) => {
    const node = el("select");
    for (const id of options) node.append(el("option", { value: id, selected: id === value }, label(id)));
    node.addEventListener("change", () => { change(node.value); render(); });
    return node;
  };
  const stepper = (value: number, min: number, max: number, step: number, change: (next: number) => void) => {
    const field = el("input", { type: "number", value: String(value), min: String(min), max: String(max), inputMode: "numeric" });
    field.style.width = "84px";
    const set = (next: number) => { change(Math.max(min, Math.min(max, Math.round(next)))); render(); };
    field.addEventListener("change", () => set(Number(field.value) || min));
    return el("span", { className: "sbx-row" }, button("−", () => set(value - step)), field, button("+", () => set(value + step)));
  };

  function unitsPanel(run: Run): Node[] {
    const counts = new Map<string, number>();
    for (const unit of run.squads[0]?.soldiers ?? []) if (unit.hp > 0 && unit.bph) counts.set(unit.bph.profileId, (counts.get(unit.bph.profileId) ?? 0) + 1);
    return [
      row(say("unit"), select(UNIT_IDS, pick.unit, unitLabel, id => { pick.unit = id; })),
      row(say("count"), stepper(pick.unitCount, 1, 50, 1, next => { pick.unitCount = next; })),
      row("", button(say("spawnGate"), () => spawnProfiles(run, pick.unit, pick.unitCount)),
        button(say("ranges"), () => { showRanges = !showRanges; }, showRanges)),
      el("div", { className: "sbx-note" }, `${say("onField")}: ${[...counts].map(([id, n]) => `${t(BPH_PROFILES[id]?.name ?? id)}×${n}`).join(", ") || say("none")}`),
    ];
  }
  function tacticsPanel(run: Run): Node[] {
    const active = run.bph?.tomes.map(tome => `${tomeLabel(tome.id)}×${tome.stacks}`).join(", ") || say("none");
    return [
      el("div", { className: "sbx-grid" }, ...TOME_IDS.map(id => button(`${say("activate")}: ${tomeLabel(id)}`, () => spawnProfiles(run, id, 1)))),
      el("div", { className: "sbx-note" }, `${say("tomesActive")}: ${active}`),
    ];
  }
  function generalPanel(run: Run): Node[] {
    const slider = el("input", { type: "range", min: "0", max: "20", step: "1", value: String(pick.chaos) });
    const shown = el("b", {}, String(pick.chaos));
    slider.addEventListener("input", () => { pick.chaos = Number(slider.value); shown.textContent = slider.value; });
    return [
      el("div", { className: "sbx-grid" }, ...BPH_GENERALS.map(general => button(t(general), () => { setup.general = general; restart(); }, setup.general === general))),
      el("div", { className: "sbx-note" }, say("restartNote")),
      row(say("chaos"), slider, shown),
      row("", button(say("chaosApply"), () => { setup.chaos = pick.chaos; setChaosLevel(run, pick.chaos); }),
        el("span", { className: "sbx-note" }, `${say("chaosNow")}: ${chaosLevel(run)}`)),
      row("", button(say("skill"), () => { skillNote = fireSkill(run, host.fire) ? "skillCast" : "skillMissed"; }),
        button(say("invincible"), () => { clock.generalInvincible = !clock.generalInvincible; }, clock.generalInvincible)),
      el("div", { className: "sbx-note" }, skillNote ? say(skillNote) : ""),
    ];
  }
  function upgradesPanel(): Node[] {
    const presets: [UpgradePreset, Word][] = [["none", "presetNone"], ["typical", "presetTypical"], ["full", "presetFull"], ["custom", "presetCustom"]];
    const nodes: Node[] = [
      row("", ...presets.map(([preset, word]) => button(say(word), () => {
        if (preset === "custom" && setup.preset !== "custom" && !setup.custom.size) setup.custom = new Set(presetPlacements("typical"));
        setup.preset = preset;
      }, setup.preset === preset))),
      row(say("gold"), stepper(setup.gold, 0, 99999, 100, next => { setup.gold = next; })),
    ];
    if (setup.preset === "custom") {
      const search = el("input", { type: "search", value: query, placeholder: say("search") });
      search.style.flex = "1";
      const list = el("div", { className: "sbx-list" });
      const fill = () => {
        list.replaceChildren(...upgradePlacements().filter(id => !query || placementLabel(id).toLowerCase().includes(query.toLowerCase())).map(id => {
          const box = el("input", { type: "checkbox", checked: setup.custom.has(id) });
          box.addEventListener("change", () => { if (box.checked) setup.custom.add(id); else setup.custom.delete(id); count.textContent = `${say("selected")}: ${setup.custom.size}`; });
          return el("label", {}, box, placementLabel(id));
        }));
      };
      const count = el("span", { className: "sbx-note" }, `${say("selected")}: ${setup.custom.size}`);
      search.addEventListener("input", () => { query = search.value; fill(); });
      fill();
      nodes.push(row("", search, count), list);
    } else nodes.push(el("div", { className: "sbx-note" }, `${say("selected")}: ${presetPlacements(setup.preset).length}`));
    nodes.push(row("", button(say("applyRestart"), restart)));
    return nodes;
  }
  function enemiesPanel(run: Run): Node[] {
    const options = onlyChapter ? chapterEnemies(setup.chapter) : ENEMY_IDS;
    if (!options.includes(pick.enemy)) pick.enemy = options.find(id => !isBoss(id)) ?? options[0] ?? ENEMY_IDS[0];
    return [
      row(say("chapter"), ...CHAPTERS.map((_, index) => button(String(index + 1), () => { setup.chapter = index + 1; restart(); }, setup.chapter === index + 1))),
      el("div", { className: "sbx-note" }, say("restartNote")),
      row(say("enemy"), select(options, pick.enemy, enemyLabel, id => { pick.enemy = id; })),
      row("", button(say("filterChapter"), () => { onlyChapter = !onlyChapter; }, onlyChapter)),
      row(say("count"), stepper(pick.enemyCount, 1, 50, 1, next => { pick.enemyCount = next; })),
      row(say("side"), ...SIDES.map(side => button(SIDE_NAMES[side][language() === "ko" ? 0 : 1], () => { pick.side = side; }, pick.side === side))),
      row("", button(say("spawnEnemy"), () => { pending.push(...spawnEnemies(run, pick.enemy, pick.enemyCount, pick.side)); }),
        button(say("holdWaves"), () => { clock.wavesHeld = !clock.wavesHeld; }, clock.wavesHeld),
        button(say("clear"), () => clearEnemies(run))),
    ];
  }
  function quickRow(): Node[] {
    return [
      button(clock.paused ? say("resume") : say("pause"), () => { clock.paused = !clock.paused; }, clock.paused),
      ...[.25, 1, 3].map(speed => button(`${speed}×`, () => { clock.speed = speed; }, clock.speed === speed)),
      button(say("step"), () => { clock.paused = true; clock.steps++; }),
      button(say("reset"), restart),
    ];
  }
  function controlPanel(): Node[] {
    return [
      row("", button(say("castle"), () => { clock.castleInvincible = !clock.castleInvincible; }, clock.castleInvincible)),
      statsBlock(true),
      el("div", { className: "sbx-note" }, say("saveNote")),
    ];
  }
  const stats = el("div", { className: "sbx-stats" });
  function statsBlock(large = false): HTMLElement {
    const run = current(), node = large ? el("div", { className: "sbx-stats" }) : stats;
    if (large) node.style.fontSize = "14px";
    if (!run) return node;
    const s = benchStats(run, clock), num = (n: number) => Math.round(n).toLocaleString();
    node.replaceChildren(...[
      [say("time"), `${s.time.toFixed(1)}s`], [say("allyHp"), `${num(s.hp)}/${num(s.maxHp)}`],
      [say("dealt"), num(s.dealt)], [say("dps"), s.dps.toFixed(1)], [say("kills"), num(s.kills)],
      [say("foes"), num(s.enemies)], [say("base"), `${num(s.base)}/${num(s.maxBase)}`], [say("blocked"), num(blocked)],
    ].map(([label, value]) => el("span", { title: label }, `${label} ${value}`)));
    return node;
  }

  function render(): void {
    toggle.textContent = say("open");
    toggle.hidden = !drawer.hidden;
    const run = current();
    if (drawer.hidden || !run) return;
    const lang = button(language() === "ko" ? "EN" : "KO", () => { setLanguage(language() === "ko" ? "en" : "ko"); });
    const body = el("div", { className: "sbx-body" });
    body.append(...(tab === "units" ? unitsPanel(run) : tab === "tactics" ? tacticsPanel(run) : tab === "general" ? generalPanel(run)
      : tab === "upgrades" ? upgradesPanel() : tab === "enemies" ? enemiesPanel(run) : controlPanel()));
    statsBlock();
    drawer.replaceChildren(
      el("header", {}, el("b", {}, say("title")), lang, button(say("close"), () => { drawer.hidden = true; })),
      stats,
      el("div", { className: "sbx-quick" }, ...quickRow()),
      el("div", { className: "sbx-tabs", role: "tablist" }, ...TABS.map(name => button(say(name), () => { tab = name; }, tab === name))),
      body,
    );
  }

  function drawRanges(): void {
    const run = current(), arena = document.querySelector<HTMLCanvasElement>("#arena > canvas");
    const context = ranges.getContext("2d");
    if (!context) return;
    if (!showRanges || !run || !arena) { ranges.width = ranges.height = 0; return; }
    const box = arena.getBoundingClientRect(), ratio = devicePixelRatio || 1;
    Object.assign(ranges.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    ranges.width = Math.round(box.width * ratio); ranges.height = Math.round(box.height * ratio);
    const sx = box.width * ratio / WIDTH, sy = box.height * ratio / HEIGHT;
    context.lineWidth = 2 * ratio;
    for (const unit of run.squads[0]?.soldiers ?? []) {
      if (unit.hp <= 0) continue;
      const reach = bphArms(unit, run)?.reach;
      if (!reach) continue;
      context.strokeStyle = "rgba(255, 220, 90, .85)"; context.fillStyle = "rgba(255, 220, 90, .07)";
      context.beginPath(); context.ellipse(unit.x * sx, unit.y * sy, reach * sx, reach * sy, 0, 0, Math.PI * 2);
      context.fill(); context.stroke();
    }
  }

  const pending: Effect[] = [];
  let ready = false, rendered = 0;
  void prepareBphUpgrades().then(function wait(): void {
    if (!current()) { requestAnimationFrame(wait); return; }
    ready = true; restart();
  });
  return {
    advance(run, seconds) {
      if (!ready) return [];
      const effects = [...pending.splice(0), ...benchAdvance(run, clock, seconds)];
      drawRanges();
      const now = performance.now();
      if (now - rendered > 250) { rendered = now; statsBlock(); }
      return effects;
    },
  };
}
