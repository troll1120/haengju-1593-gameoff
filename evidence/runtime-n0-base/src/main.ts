import Phaser from "phaser";
import "./style.css";
import { BOSS_MARKS, chargeRing, pixelIcon, timberFrame } from "./icons";
import { cardPicture, prizePicture, skillPicture, soldierArt, stars } from "./card-art";
import type { IconName } from "./icons";
import { YARD_PICTURES, yardPicture } from "./yard";
import { language, openIn, setLanguage, t, tr } from "./i18n";
import { relabelDom } from "./i18n-dom";
import { loadingFailed, startFailed, startProgress, startReady } from "./start-loading";
import { mountWeatherHud } from "./weather-hud";
import { setupPanelMotion } from "./panel-motion";
import { showFirstBattleGuide } from "./first-battle-guide";
import "./audio/volume-controls";
import { award, bonusesOf, canBuy, getMetaBonuses, keepMeta, loadMeta, meritFor, META_NODES, nextUnlocks, openGenerals } from "./meta";
import { diagnosis, treeView } from "./meta-view";
import { fewest, PRIZE_TIERS, REINFORCE, SOLDIERS, buyRecruit, recruitCost, GENERAL_CLASS, SOLDIER_NAMES } from "./rules";
import { audioState, cancelPendingSfx, playSfx as emitSfx, setBgmIntensity, setBgmScene, setMuted, startBgm, stopBgm } from "./audio";
import type { SfxName } from "./audio";
import { MOTION, stepHop, stepsWalked, FRIENDLY_ATTACK, friendlyStrikeOffset } from "./motion";
import { advance, ARMS, BALANCE, cardText, choose, chooseGeneral, createRun, DURATION, enterEndless, fielded, fit, rouletteIndex,
  SIEGE_EVERY, skillAim, SKILL_NAMES, upgradeClass, upgradeCost, useSkill, growthTier, reelCards } from "./rules";
import type { Aim, CardId, Effect, EnemyKind, General, Roulette, Run, SoldierKind, Squad, Unit } from "./rules";
import { CENTER, distance, FORT_TILES, fortRect, HEIGHT, route, setFieldSize, TILE, weaponSlots, WIDTH } from "./geometry";
import type { Direction, Point } from "./geometry";
import { buildings, cornerOpen, keepStage } from "./fortification";
import { sideOf, gapToRect } from "./geometry";
import { BOSSES, FULL_BOSS_ART } from "./bosses";
import { ImpactBudget } from "./impact";
import { DamageNumbers, damageNumberFrame, hitFlash, hitRecoil, whitenHitPixels } from "./hit-feedback";
import { attackFacing, spriteFlipX } from "./attack-facing";
import { emitContactParticles, ParticleCap, storm } from "./fxdensity";
import { ARMY_KINDS, GENERAL_ART, GENERAL_SCALE, generalPortrait, generalUnit, rosterFor } from "./roster";
import { ENEMY_ANIMATIONS, ENEMY_TEXTURES as foeTextures, GENERAL_SHEET_COLUMNS, enemyAnimation, enemyArt, enemyMotion, sampleEnemyMotion } from "./enemy-animation";
import type { EnemyMotion } from "./enemy-animation";
import { ALLY_ANIMATIONS, ALLY_TEXTURES, FULL_ALLY_ART, allyAnimation, allyArt, allyAttackFrame } from "./ally-animation";
import { riverBank, SHIP_TEXTURES, SHIP_FRAME, SHIP_POSES } from "./river";
import { battleLayout, showEnemyHealth, retainRoster, UNIT_FRAME, BOSS_FRAME } from "./sprite-layout";
import { spriteHealthAnchor } from "./sprite-health";
import { drawAttackPreparation } from "./attack-preparation";
import { reserveHealthBar } from "./health-bars";
import type { HealthBar } from "./health-bars";
import { cardRarity } from "./cards";
import { ARROW_ART, bodyDepth, bodyScale, color, DecorationBudget, feedbackChannels, LAYER, PALETTE, paintedRange, rangeCells, shotArt, skillCharge } from "./presentation";
import { personalize, recolorPainted } from "./general-art";
import { PaintedArt } from "./painted-art";
import { PAINTED_FILES } from "./painted-files";
import { WallShield } from "./wall-shield";
import { UniqueSkillView } from "./skills-unique-view";
import { bannerPlacement, castResults, effectArea, holdBack, noteCast } from "./skill-show";
import type { Area, Band } from "./skill-show";
import { SkillStage } from "./skill-stage";
import { SKILL_SHOWS } from "./shows";
import { CHAOS_SHOWS } from "./chaos-shows";
import { chaosAreas } from "./chaos-shows/areas";
import { UNIQUE_SKILL_DESCRIPTIONS } from "./skills-unique";
import { BPH_GENERALS } from "./bph-commanders";
import { checkGeneralUnlocks } from "./bph-general-unlock-view";
import { ensureBphSave, createBphRun, settleBphRun, bphMilestones } from "./bph-session";
import { mountBphCodexEntry, renderBphField, renderBphShop, type BphPanels } from "./bph-view";
import { endBphShopVisit, prepareBphFieldShop, prepareBphManagementShop } from "./bph-shop-session";
import { activeBphEffects, recordBphProgress, prepareBphUpgrades } from "./bph-upgrades";
import { growthFor } from "./skill-growth";
import { skillGrowthDescription, skillPips } from "./skill-growth-view";
import { takeBphRefundNotice } from "./bph-upgrade-migration";
import { showBphRefundToast } from "./bph-refund-toast";
import { closeBphRelicToast, showBphRelicToast } from "./bph-relic-toast";
import { takeBphRelicNotices } from "./bph-relics";
import { updateBphPointer } from "./bph-fx-dispatch";
import { refreshBphEffects } from "./bph-fx-dispatch";
import { enterBphImprovements, notifyBphQuestCompletion, projectBphSalary, startBphCampaignAttempt } from "./bph-account";
import { bphArtFile, bphUnitArt } from "./bph-art";
import { BossCamera } from "./boss-camera";
import { showResultUnlocks } from "./result-screen";

const hitSources = import.meta.glob<string>("./assets/hitfx/*_fx.png", { eager: true, query: "?url", import: "default" });
const hitPaths = Object.keys(hitSources), hitFrames = Object.values(hitSources);
const hitFrame = (actor: string, frame: number) => `hit-frame-${hitPaths.findIndex(path => path.endsWith(`/${actor}_side_attack_${frame}_fx.png`))}`;
const burstActors = { flame: "gwon_yul", powder: "kim_simin", evolution: "cheo_yeong" } as const;
type BurstStyle = keyof typeof burstActors;
const GENERAL_BURSTS: Record<General, BurstStyle> = { 권율: "flame", 김시민: "powder", 곽재우: "evolution",
  사명대사: "evolution", 이순신: "powder",
  황진: "powder", 처영: "evolution", 조헌: "flame", 신립: "evolution", 이복남: "flame",
  정발: "powder", 송상현: "flame", 신각: "powder", 김명원: "flame", 김여물: "evolution", 정담: "powder",
  노개방: "evolution", 영규: "evolution", 이여송: "evolution", 이정헌: "flame", 김희수: "flame", 송봉수: "powder" };
const strikeActors: Record<string, string> = { 권율: "gwon_yul", 김시민: "kim_simin", 곽재우: "kwak_jaeu",
  황진: "gwon_yul", 처영: "cheo_yeong", 조헌: "gwon_yul", 신립: "kwak_jaeu", 이복남: "gwon_yul",
  정발: "spearman", 송상현: "gwon_yul", 신각: "spearman", 김명원: "gwon_yul", 김여물: "kwak_jaeu", 정담: "spearman",
  노개방: "monk", 영규: "monk", 이여송: "kwak_jaeu", 이정헌: "gwon_yul", 김희수: "gwon_yul", 송봉수: "spearman",
  spearman: "spearman", monk: "monk", ming_cavalry: "spearman" };
const foeStrikes: Record<string, string> = { yari: "yari", samurai: "samurai", cavalry: "kiba", ukita: "ukita", konishi: "konishi", kobayakawa: "kobayakawa", wakizaka: "wakizaka", so_yoshitoshi: "so" };
const ownTextures = ALLY_TEXTURES;
const portrait = generalPortrait;
const parameters = new URLSearchParams(location.search);
const availableGenerals = BPH_GENERALS;
function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`화면 요소가 없습니다: ${id}`);
  return value as T;
}
const overlay = element("overlay"), intro = element("intro"), choices = element("choice"), result = element("result");
const cards = element("cards"), notice = element("notice"), reelStrip = element("strip"), drills = element("drills"), skillRow = element("skills"), banner = element("cut-in");
const weatherHud = mountWeatherHud(element("app"));
type Saved = { story: boolean; firstBattleGuide: boolean; muted: boolean; timers: boolean; motionOff: boolean; flashesOff: boolean; record: { plays: number; wins: number; kills: number; score: number; fastest: number } };
const STORE = "haengju1593", STORY_MS = 4000;
function load(): Saved {
  const fresh: Saved = { story: false, firstBattleGuide: false, muted: false, timers: true, motionOff: false, flashesOff: false, record: { plays: 0, wins: 0, kills: 0, score: 0, fastest: 0 } };
  try {
    const kept = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<Saved>;
    return { ...fresh, ...kept, record: { ...fresh.record, ...kept.record } };
  } catch { return fresh; }
}
const saved = load(), meta = loadMeta();
const bphSave = ensureBphSave(meta);
let savedCodexState = "";
function keepCodexChanges(): void {
  // Discoveries and receipt IDs only grow. Coalesce all events in this frame.
  const next = [bphSave.discovered.length, bphSave.codexRewards?.claimed.length ?? 0,
    bphSave.codexRewards?.pendingGold ?? 0].join(":");
  if (next === savedCodexState) return;
  keepMeta(meta);
  savedCodexState = next;
}
const refundNotice = takeBphRefundNotice(bphSave);
if (bphSave.hiddenUpgradeRefund) keepMeta(meta);
if (refundNotice) showBphRefundToast(refundNotice);
function keep(): void {
  try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch { return; }
}
setMuted(saved.muted);
openIn(navigator.language);
setupPanelMotion();
const app = element("app"), titleLayer = element("title"), logo = element("logo"), story = element("story"), picker = element("pick"), starters = element("starter-cards"), barracks = element("barracks");
const bphScreen = document.createElement("div"), bphField = document.createElement("div");
bphScreen.className = "bph-screen"; bphScreen.hidden = true;
bphField.className = "bph-field-host"; bphField.hidden = true;
app.append(bphField, bphScreen);
let closeBphShop: (() => void) | undefined, updateBphField: (() => void) | undefined;
async function showBphShop(open?: keyof BphPanels): Promise<void> {
  await prepareBphUpgrades();
  closeBphShop?.();
  if (run?.bph && run.phase === "playing") return;
  checkGeneralUnlocks(meta, element("start"));
  const general = BPH_GENERALS.find(name => name === startingGeneral) ?? "권율";
  createBphRun(meta, { seed: 1593, general, upgrades: activeBphEffects(bphSave), startBattle: false });
  projectBphSalary(bphSave, activeBphEffects(bphSave));
  startBphCampaignAttempt(bphSave); enterBphImprovements(bphSave);
  prepareBphManagementShop(bphSave, activeBphEffects(bphSave)); keepMeta(meta);
  closeBphShop = renderBphShop(bphScreen, { save: bphSave, general, milestones: bphMilestones(meta), open,
    effects: () => activeBphEffects(bphSave), panels: {
      upgrades: async (host, context) => (await import("./bph-upgrade-view")).renderBphUpgrades(host, context),
      relics: async (host, context) => (await import("./bph-relic-view")).renderBphRelics(host, context),
    },
    onSave: () => {
      const effects = activeBphEffects(bphSave);
      refreshBphEffects(bphSave, effects); projectBphSalary(bphSave, effects);
      prepareBphManagementShop(bphSave, effects);
      for (const placementId of bphSave.purchasedPlacements) notifyBphQuestCompletion(bphSave, placementId);
      keepMeta(meta);
    },
    onStart: selected => {
      closeBphShop?.(); closeBphShop = undefined; bphScreen.hidden = true; startingGeneral = selected;
      if (!run) { start(selected); return; }
      const requested = Number(parameters.get("seed"));
      begin(Number.isInteger(requested) && requested > 0 && requested <= 0xffff_ffff ? requested : randomSeed(), false, { general: selected });
    },
    onClose: () => { closeBphShop?.(); closeBphShop = undefined; bphScreen.hidden = true; stage(logo); title(); },
  });
  announceBphRelics();
}
function announceBphRelics(): void {
  const gained = takeBphRelicNotices(bphSave);
  if (!gained.length) return;
  keepMeta(meta);
  showBphRelicToast(app, gained, () => {
    const tab = bphScreen.hidden ? null : bphScreen.querySelector<HTMLButtonElement>('[data-bph-tab="relics"]');
    if (!tab) { showBphShop("relics"); return; }
    if (tab.getAttribute("aria-pressed") !== "true") tab.click();
  });
}
const tone = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** On a device set to reduce motion the big hits shake less, skip the screen flash and stop shorter. */
const stillness = matchMedia("(prefers-reduced-motion: reduce)");
let paused = false, calm = stillness.matches, dealtAt = 0, picking = false, attract = false, queuedStart: General | null = null, lastReel = -1, storyTimer: ReturnType<typeof setTimeout> | null = null, settled = "", rolled = "";
let firstBattleGuideOpen = false;
stillness.addEventListener("change", () => { calm = stillness.matches; });
let startingGeneral: General = "권율";
let leveled = 1, filled = "", masteryKills = 0;
/** Effects belong to a battle: while the demo plays behind the title, intro and pick, only the music sounds. */
function playSfx(name: SfxName, delaySeconds = 0): void { if (!attract) emitSfx(name, delaySeconds); }
let reelUntil = 0, spun: Roulette | null = null, drillKey = "";
// Reel ticks sound on the visual events; the existing brake and stop schedule remains unchanged.
const DEAL = { land: 300, fly: 460, tally: 800 }, REEL = { fast: 620, stops: [810, 1020, 1160], pace: 40 };
for (const [name, ms] of Object.entries(DEAL)) document.documentElement.style.setProperty(`--${name}`, `${ms}ms`);
let run: Run | null = null, effects: Effect[] = [], shownPhase = "ready", runSerial = 0, aims: (Aim | null)[] = [];
for (const eventName of ["pointerdown", "pointermove"] as const) element("app").addEventListener(eventName, event => {
  if (!run || paused || !(event.target instanceof Element) ||
    (!element("arena").contains(event.target) && !event.target.closest(".bph-field-pack"))) return;
  const rect = element("arena").getBoundingClientRect();
  const camera = game.scene.getScene("castle").cameras.main;
  updateBphPointer(run, camera.getWorldPoint(
    Math.max(0, Math.min(WIDTH, (event.clientX - rect.left) / rect.width * WIDTH)),
    Math.max(0, Math.min(HEIGHT, (event.clientY - rect.top) / rect.height * HEIGHT))));
}, { passive: true });
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
const freshFeedback = () => ({ hitFrames: 0, whiteFlashes: 0, knockbacks: 0, numbers: 0, criticalNumbers: 0, totals: 0, largestTotal: 0,
  debris: 0, chains: 0, smoke: 0, sparks: 0, rings: 0, wallFlashes: 0, shakes: 0, hitStops: [] as number[], hitStopEvents: [] as { at: number; ms: number }[], screenFlashes: 0,
  burstTypes: { flame: 0, powder: 0, evolution: 0 }, viewportFlashes: 0, assaultWarnings: 0,
  windups: 0, swings: 0, projectiles: 0, lunges: 0, hurtFlashes: 0, blocks: 0, interrupts: 0, telegraphs: 0, landings: 0, skillBursts: 0,
  steps: 0, foeSteps: 0, strikePoses: 0, strikeFrames: 0, topples: 0, bossEntrances: 0, bossRages: 0, wallCrumbles: 0, breaches: 0, keepStage: 0, keepCollapses: 0, barracksGlows: 0, falls: 0,
  bigCrits: 0, maxProjectileScale: 1, flamingArrows: 0, largestBlastScale: 1, largestSkillScale: 1 });
let feedback = freshFeedback();
/** No unexplained icon-only notification banners. */

function strip(file: string, frames = 1, frame = 0, tall = false): string {
  return frames === 1 ? `<img src="./art/${file}" alt="" class="single" />`
    : `<img src="./art/${file}" alt="" style="width:${frames * 64}px;height:${tall ? 96 : 64}px;margin-left:${-frame * 64}px" />`;
}
const cardArt = (card: CardId): string => cardPicture(card, run);
const STOP_CALLS: Record<string, SfxName | undefined> = { rare: "card", cursed: "card", epic: "prize", legend: "evolve" };
/** One offered card as a slot reel: faces race past at one per REEL.pace until REEL.fast, then the reel brakes and stops on its own picture at its turn, left to right. */
function roll(button: HTMLElement, order: number, own: string, face: string, rarity: string): void {
  const stopAt = REEL.stops[2] - (2 - Math.min(order, 2)) * 70, braking = 3;
  const candidates = run ? reelCards(run, order).map(cardArt) : [own];
  const faces = [own, ...Array.from({ length: Math.round(REEL.fast / REEL.pace) + braking }, () => candidates[Math.floor(Math.random() * candidates.length)] ?? own)];
  const raised = (cells: number) => `translateY(${-100 * cells / faces.length}%)`;
  button.classList.add("spinning");
  button.innerHTML = `<span class="reel"><span class="reel-strip">${faces.map(art => `<span class="card-illustration">${art}</span>`).join("")}</span></span>`;
  button.querySelector(".reel-strip")!.animate([{ transform: raised(faces.length - 1), easing: "linear" },
    { transform: raised(3), offset: (stopAt - 380) / stopAt, easing: "steps(1, end)" },
    { transform: raised(2), offset: (stopAt - 300) / stopAt, easing: "steps(1, end)" },
    { transform: raised(1), offset: (stopAt - 180) / stopAt, easing: "steps(1, end)" }, { transform: "none" }],
    { duration: calm || saved.motionOff ? 0 : stopAt, fill: "both" }).onfinish = () => {
    button.innerHTML = face; button.classList.replace("spinning", "landed"); button.classList.toggle("quiet", !feedbackChannels(saved.motionOff, saved.flashesOff, calm).flash);
    const call = STOP_CALLS[rarity];
    if (call && button.isConnected && !picking && !choices.hidden && !overlay.hidden) playSfx(call);
  };
}
const PLUS = pixelIcon("plus"), LOCK = pixelIcon("lock");
document.documentElement.style.setProperty("--xp-card", `url("${new URL(pixelIcon("card"), document.baseURI).href}")`);
/** A name on screen keeps its Korean source, so a language switch can reword it where it stands. */
const named = (korean: string) => `<strong data-ko="${korean}">${t(korean)}</strong>`;
function generalCard(general: General, tier = 1, compact = false): string {
  const kind = GENERAL_CLASS[general];
  return `<span class="hero-pair"><span class="named-portrait"><img class="portrait" src="./art/portraits/${portrait(general)}.png" alt="" />${stars(tier)}${compact ? "" : named(general)}</span><img class="pair-plus" src="${PLUS}" alt="" /><span class="named-portrait companion"><span class="mini"><img src="./art/units/${kind}.png" alt="" /></span>${compact ? "" : named(SOLDIER_NAMES[kind])}</span></span>${compact ? named(general) : ""}`;
}
const opened = () => bphSave.unlockedGenerals.filter(name => availableGenerals.some(general => general === name)).length;
const MERIT = pixelIcon("merit");
const CHARGE_CELLS = Number(tone("--charge-cells"));
document.documentElement.style.setProperty("--charge", `url("${chargeRing("plate")}")`);
for (const [name, kind] of [["--ring", "portrait"], ["--ring-urgent", "urgent"]] as const)
  document.documentElement.style.setProperty(name, `url("${chargeRing(kind)}")`);
const listBarracks = treeView(element("barracks-list"), meta);
function stage(shown: HTMLElement): void {
  if (shown === picker || shown === barracks) { showBphShop(); return; }
  if (storyTimer !== null) { clearTimeout(storyTimer); storyTimer = null; }
  for (const layer of [logo, story, picker, barracks]) layer.hidden = layer !== shown;
  app.classList.toggle("fronted", shown === logo);
  element("barracks-pip").hidden = true;
  element("barracks-open").classList.toggle("ready", META_NODES.some(entry => canBuy(meta, entry.id)));
  if (shown === logo) { checkGeneralUnlocks(meta, element("start")); refreshCodexEntry(bphSave); if (!app.classList.contains("loading")) announceBphRelics(); }
  if (shown === barracks) { listBarracks(); element("endless").hidden = !bonusesOf(meta).endless; }
  if (shown !== picker) return;
  picker.scrollTop = 0;
  starters.replaceChildren(...availableGenerals.map((general, order) => {
    const button = document.createElement("button"), locked = order >= opened();
    button.className = `card starter epic${locked ? " locked" : ""}`; button.dataset["startGeneral"] = general; button.disabled = locked;
    button.setAttribute("aria-label", tr`${general}, ${SOLDIER_NAMES[GENERAL_CLASS[general]]}`);
    button.innerHTML = generalCard(general, 1, true) + (locked ? `<img class="lock" src="${LOCK}" alt="" />` : "");
    button.addEventListener("click", () => start(general));
    return button;
  }));
}
const codexScreen = document.createElement("div");
codexScreen.className = "bph-screen"; codexScreen.hidden = true; app.append(codexScreen);
let closeCodex: (() => void) | undefined;
async function openCodex(): Promise<void> {
  const { renderBphCodex } = await import("./bph-codex");
  closeCodex?.(); codexScreen.hidden = false;
  const onClose = () => { closeCodex?.(); closeCodex = undefined; codexScreen.hidden = true; refreshCodexEntry(bphSave); };
  // Preview builds only: `?codex=all` draws a detached copy with everything found; the real save is never written.
  if (import.meta.env.CASTLE_CODEX_PREVIEW && parameters.get("codex") === "all") {
    const { bphCodexPreviewNotice, bphCodexPreviewSave } = await import("./bph-codex-preview");
    closeCodex = renderBphCodex(codexScreen, { save: bphCodexPreviewSave(bphSave), milestones: bphMilestones(meta),
      notice: bphCodexPreviewNotice(), onChange: () => undefined, onClose });
    return;
  }
  checkGeneralUnlocks(meta, element("start"));
  closeCodex = renderBphCodex(codexScreen, { save: bphSave, milestones: bphMilestones(meta), onChange: () => keepMeta(meta), onClose });
}
const refreshCodexEntry = mountBphCodexEntry(element("start").parentElement ?? logo, openCodex);
logo.addEventListener("click", () => startBgm());
element("start").addEventListener("click", () => {
  startBgm(); showBphShop();
});
story.addEventListener("click", () => stage(picker));
element("barracks-open").addEventListener("click", () => stage(barracks));
for (const home of ["barracks-close", "pick-back"]) element(home).addEventListener("click", () => stage(logo));
element("title-settings").addEventListener("click", () => { if (run && !paused) menu(true, "title"); });
stage(logo);
if (import.meta.env.CASTLE_CODEX_PREVIEW && parameters.get("codex") === "all") void openCodex();
function tap(target: HTMLElement, act: () => void): void {
  target.addEventListener("pointerdown", event => { event.preventDefault(); act(); });
  target.addEventListener("click", act);
}
function pick(button: HTMLElement, target: Point, apply: () => void): void {
  if (picking || button.classList.contains("spinning")) return;
  picking = true; playSfx("pick");
  const from = button.getBoundingClientRect(), field = game.canvas.getBoundingClientRect();
  const x = field.left + target.x / WIDTH * field.width, y = field.top + target.y / HEIGHT * field.height;
  for (const other of Array.from(cards.children)) if (other !== button) other.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(26px)" }], { duration: 170, fill: "forwards" });
  button.style.zIndex = "2";
  button.animate([{ transform: "none" }, { transform: "scale(1.16)", offset: .32 }, { transform: `translate(${x - from.left - from.width / 2}px, ${y - from.top - from.height / 2}px) scale(.12)`, opacity: .6 }],
    { duration: DEAL.fly, easing: "ease-in", fill: "forwards" }).onfinish = () => {
    const spark = document.createElement("img"); spark.className = "landing"; spark.src = "./art/fx/hit.png"; spark.alt = ""; spark.style.left = `${x}px`; spark.style.top = `${y}px`; document.body.append(spark);
    spark.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 }).onfinish = () => spark.remove();
    picking = false; apply(); updateHud();
  };
}
function fire(id: number): void {
  if (!run) return;
  const cast = useSkill(run, id);
  if (cast.length) herald(run.squads[id].general, castAreas(run, run.squads[id].general, cast));
  noteCast(cast); effects.push(...cast); updateHud();
}
const HERALD_MS = 500, CALLOUT_MS = 720;
/** The ground a cast covers, every live enemy warning and every army picture on the field, so the name banner can stay clear of them. */
function castAreas(current: Run, general: General, cast: readonly Effect[]): Area[] {
  const show = SKILL_SHOWS.find(item => item.general === general);
  return [...cast.filter(effect => effect.kind === "skill").flatMap(skill => show?.areas?.(skill, current) ?? [effectArea(skill)]),
    ...current.telegraphs.map(mark => mark.shape === "lane" ? { x: mark.x, y: mark.y, radius: mark.radius, from: { x: mark.fromX, y: mark.fromY } }
      : { x: mark.x, y: mark.y, radius: mark.radius }), ...chaosAreas(current.chaos, fortRect(current.fort))];
}
/** A skill's big moment: the general's portrait rides a banner across the top of the field, or the bottom when the cast's ground or an
 *  enemy warning lies under the top place. A staged skill also calls out its name and stays long enough to be read. */
function herald(general: General, areas: readonly Area[]): void {
  const face = banner.querySelector("img")!, title = banner.querySelector("strong")!;
  const staged = SKILL_SHOWS.find(show => show.general === general), ms = staged ? CALLOUT_MS : HERALD_MS;
  for (const old of [...banner.getAnimations(), ...face.getAnimations(), ...title.getAnimations()]) old.cancel();
  face.src = `./art/portraits/${portrait(general)}.png`; title.textContent = staged ? t(SKILL_NAMES[general]) : ""; banner.hidden = false;
  banner.classList.remove("low");
  const field = game.canvas.getBoundingClientRect(), box = banner.getBoundingClientRect(), cssPixel = WIDTH / field.width;
  banner.classList.toggle("low", bannerPlacement({ top: (box.top - field.top) * cssPixel, bottom: (box.bottom - field.top) * cssPixel }, areas) === "bottom");
  if (staged) banner.style.setProperty("--cut-in-band", color(staged.accent)); else banner.style.removeProperty("--cut-in-band");
  if (!calm) face.animate([{ transform: "translateX(-50%)" }, { transform: "none", offset: .2 }, { transform: "translateX(8%)", offset: .8 }, { transform: "translateX(60%)" }], ms);
  if (!calm && staged) title.animate([{ transform: "translateX(var(--space-6))", opacity: 0 }, { transform: "translateX(calc(var(--space-1) * -1))", opacity: 1, offset: .2 },
    { transform: "none", opacity: 1, offset: .28 }, { transform: "none", opacity: 1, offset: .8 }, { transform: "translateX(calc(var(--space-5) * -1))", opacity: 0 }], ms);
  banner.animate(calm ? [{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .8 }, { opacity: 0 }] : [
    { clipPath: "inset(0 100% 0 0)", filter: "brightness(3)" }, { clipPath: "inset(0 0 0 0)", filter: "brightness(1)", offset: .2 },
    { clipPath: "inset(0 0 0 0)", filter: "brightness(1)", offset: .8 }, { clipPath: "inset(0 0 0 100%)", filter: "brightness(1)" },
  ], ms).onfinish = () => { banner.hidden = true; };
}
/** The cut-in banner's rows in field pixels while it shows, so a skill's big number never pops behind it. */
function bannerBand(canvas: HTMLCanvasElement, cssPixel: number): Band | undefined {
  if (banner.hidden) return undefined;
  const box = banner.getBoundingClientRect(), field = canvas.getBoundingClientRect();
  return { top: (box.top - field.top) * cssPixel, bottom: (box.bottom - field.top) * cssPixel };
}
/** One square skill picture per general above the experience bar: it lights from the bottom as the skill charges, and a full picture glows until it is tapped. */
function syncSkills(current: Run): void {
  while (skillRow.children.length > current.squads.length) skillRow.lastElementChild?.remove();
  current.squads.forEach((squad, id) => {
    const { tier } = growthFor(squad.general, current);
    // A general who joins gets a new button; the ones already seated stay, so they keep their glow and the keyboard's focus.
    const seated = skillRow.children[id] as HTMLButtonElement | undefined;
    const button = seated?.dataset["general"] === squad.general ? seated : document.createElement("button");
    const description = UNIQUE_SKILL_DESCRIPTIONS[squad.general];
    if (description) button.title = `${t(SKILL_NAMES[squad.general])}: ${t(description)}`;
    if (button !== seated) {
      button.className = "skill icon-button big"; button.type = "button"; button.dataset["general"] = squad.general; button.setAttribute("aria-label", tr`${squad.general} ${SKILL_NAMES[squad.general]}`);
      const image = `<span class="skill-glyph">${skillPicture(squad.general)}</span>`;
      button.innerHTML = `<span class="skill-art">${image}<span class="skill-bright">${image}</span></span><img class="skill-portrait" src="./art/portraits/${portrait(squad.general)}.png" alt="" />${skillPips(tier)}`;
      tap(button, () => { if (!paused) fire(id); });
      if (seated) seated.replaceWith(button); else skillRow.append(button);
    }
    const down = squad.state === "down", ready = fielded(squad) && squad.skillClock <= 0;
    const lit = skillCharge(squad.skillClock, BALANCE.cooldown[squad.general]);
    const urgent = current.telegraphs.length > 0, frenzy = squad.frenzyUntil > current.time;
    const state = `${lit}:${down}:${ready}:${urgent}:${frenzy}:${tier}:${language()}`;
    if (button.dataset["state"] === state) return;
    button.dataset["state"] = state; button.style.setProperty("--lit", String(lit)); button.style.setProperty("--fill", `${lit / 12 * 100}%`); button.disabled = down;
    button.dataset.tier = String(tier);
    button.querySelectorAll(".skill-pips i").forEach((pip, index) => pip.classList.toggle("filled", index < tier));
    button.setAttribute("aria-label", tr`${squad.general} ${SKILL_NAMES[squad.general]} · Lv ${tier}: ${skillGrowthDescription(squad.general, tier)}`);
    button.classList.toggle("ready", ready); button.classList.toggle("urgent", urgent); button.classList.toggle("frenzy", frenzy);
  });
}
function damageRows(current: Run): HTMLElement[] {
  const dealt = current.metrics.damage;
  const rows: [string, number][] = [...current.squads.map((s): [string, number] => [`./art/portraits/${portrait(s.general)}.png`, dealt.squads[s.id]]),
    ["weapon", dealt.weapon], ["skill", dealt.skill]];
  const most = Math.max(1, ...rows.map(row => row[1]));
  return rows.map(([image, amount]) => {
    const row = document.createElement("div"); row.className = "damage-row";
    const art = image === "weapon" ? cardArt(current.hwacha > current.arrow ? "hwacha" : "arrow")
      : image === "skill" ? skillPicture(current.commander) : `<img src="${image}" alt="" />`;
    row.innerHTML = `<span class="damage-picture">${art}</span><div class="bar"><i style="width:${amount / most * 100}%"></i></div>`;
    return row;
  });
}
const prizeFaces = new WeakMap<Roulette, Record<string, string>>();
function prizeArt(bonus: string, reward: Roulette): string {
  let pictures = prizeFaces.get(reward);
  if (!pictures) {
    pictures = Object.fromEntries(reward.options.map(option => [option, prizePicture(option, reward, run)]));
    prizeFaces.set(reward, pictures);
  }
  return pictures[bonus];
}
function spin(reward: Roulette, index: number, landed = false): void {
  const size = reward.options.length;
  reelStrip.hidden = false;
  const rarity = reward.card ? cardRarity(reward.card) : null;
  reelStrip.className = `strip ${landed ? `landed tier-${reward.evolution || rarity === "legend" ? 3 : rarity === "epic" ? 2 : rarity === "rare" ? 1 : PRIZE_TIERS[reward.options[index]]}` : "spinning"}`;
  reelStrip.innerHTML = [-2, -1, 0, 1, 2].map(offset => {
    const bonus = reward.options[(index + offset + size * 2) % size];
    return `<span class="cell${offset ? "" : " on"}"><i class="pic card-illustration">${prizeArt(bonus, reward)}</i></span>`;
  }).join("");
}
function syncDrills(current: Run): void {
  const key = ARMY_KINDS.map(kind => { const cost = upgradeCost(current, kind); return `${cost}:${current.drill[kind]}:${cost !== null && cost <= current.gold}`; }).join("|");
  if (key === drillKey) return;
  drillKey = key;
  drills.innerHTML = ARMY_KINDS.map(kind => {
    const cost = upgradeCost(current, kind), level = current.drill[kind];
    if (cost === null && !level) return "";
    const art = `<span class="chip-soldier">${soldierArt(kind)}</span>`;
    return `<button class="chip drill${cost !== null && cost <= current.gold ? " ready" : ""}" data-kind="${kind}"${cost === null ? " disabled" : ""} aria-label="${tr`${SOLDIER_NAMES[kind]} 강화`}">${art}${stars(level + 1)}`
      + (cost === null ? "" : `<span class="chip-price"><img width="24" height="24" src="${pixelIcon("coin")}" alt="" />${cost}</span>`) + `</button>`;
  }).join("");
}
drills.addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>("button[data-kind]");
  if (!run || attract || !button) return;
  effects.push(...upgradeClass(run, button.dataset["kind"] as SoldierKind)); drillKey = ""; updateHud();
});
element("recruits").innerHTML = SOLDIERS.map(kind => `<button class="chip" data-recruit="${kind}" aria-label="${tr`${SOLDIER_NAMES[kind]} 모집`}"><span class="mini"><img src="./art/units/${kind}.png" alt="" /></span><img class="recruit-plus" width="12" height="12" src="${PLUS}" alt="" /><span class="chip-price"></span></button>`).join("");
element("recruits").addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>("[data-recruit]");
  if (!run || !button || paused) return;
  effects.push(...buyRecruit(run, button.dataset["recruit"] as SoldierKind)); updateHud();
});
function crack(): void {
  const shard = document.createElement("i"); shard.className = "crack"; document.body.append(shard);
  shard.animate([{ opacity: 1 }, { opacity: 1, offset: .6 }, { opacity: 0 }], { duration: 900 }).onfinish = () => shard.remove();
  playSfx("drum");
}
const DEFEAT_HOLD = 1500;
function defeat(): void {
  if (!feedbackChannels(saved.motionOff, saved.flashesOff, calm).flash) return;
  const veil = element("screen-flash"), serial = runSerial;
  feedback.screenFlashes++; feedback.viewportFlashes++;
  result.hidden = true; veil.hidden = false; veil.style.background = color(PALETTE.danger);
  veil.animate([{ opacity: 0 }, { opacity: .6 }], { duration: DEFEAT_HOLD, fill: "forwards" });
  setTimeout(() => {
    veil.getAnimations().forEach(animation => animation.cancel()); veil.hidden = true; veil.style.background = "";
    if (serial === runSerial && run?.phase === "lost") result.hidden = false;
  }, DEFEAT_HOLD);
}
function updateHud(): void {
  if (!run) return;
  if (attract) return;
  if (calm || saved.motionOff) cards.querySelectorAll(".reel-strip").forEach(strip => strip.getAnimations().forEach(animation => animation.finish()));
  updateBphField?.();
  element("synergies").hidden = true;
  const seconds = Math.floor(run.time);
  element("clock").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const bar = element("xp"), mastery = element("mastery-earned"), value = element("mastery-earned-value");
  bar.hidden = Boolean(run.bph); mastery.hidden = !run.bph;
  if (run.bph) {
    value.textContent = tr`강화 포인트 +${run.bph.pendingMastery}`;
    if (run.kills > masteryKills) {
      value.getAnimations().forEach(animation => animation.cancel());
      value.animate(calm || saved.motionOff ? [{ opacity: .6 }, { opacity: 1 }]
        : [{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 180, easing: "ease-out" });
    }
  }
  masteryKills = run.kills;
  const share = Math.min(1, run.xp / run.nextXp).toFixed(3);
  if (share !== filled) { filled = share; bar.style.setProperty("--share", share); bar.setAttribute("aria-valuenow", String(Math.round(Number(share) * 100))); }
  if (run.level > leveled && !calm) {
    const flash = { duration: 520, easing: "steps(5, end)" };
    bar.animate([{ backgroundColor: tone("--cream") }, { backgroundColor: tone("--wood-dark") }], flash);
    bar.animate([{ transform: "scale(2)" }, { transform: "none" }], { ...flash, pseudoElement: "::after" });
  }
  leveled = run.level;
  syncDrills(run); syncSkills(run);
  reelStrip.style.top = "";
  element("recruits").querySelectorAll<HTMLButtonElement>("button").forEach(button => {
    button.disabled = run!.gold < recruitCost(run!);
    button.querySelector(".chip-price")!.innerHTML = `<img width="24" height="24" src="${pixelIcon("coin")}" alt="" />${recruitCost(run!)}`;
  });
  setBgmIntensity(run.enemies.some(enemy => enemy.kind === "ukita") ? 3 : run.waveUntil > run.time ? 2 : run.enemies.some(enemy => enemy.boss) || run.warnedWave ? 1 : 0);
  if (run.roulette) {
    const index = rouletteIndex(run.roulette);
    if (index !== lastReel || spun !== run.roulette) { lastReel = index; spun = run.roulette; playSfx("tick"); spin(run.roulette, index); }
  } else if (spun) {
    spin(spun, 0, true); spun = null; lastReel = -1; reelUntil = performance.now() + 1200;
  } else if (!reelStrip.hidden && performance.now() > reelUntil) reelStrip.hidden = true;
  // Chests wait behind an open hand; levels earned during a chest wait behind
  // both its spin and its landed reward. Combat and growth continue throughout.
  if (run.phase === "choice" && (run.roulette || !reelStrip.hidden)) {
    choices.hidden = overlay.hidden = true; shownPhase = "playing"; return;
  }
  // A queued level deals a fresh hand while the phase stays "choice".
  if (shownPhase === run.phase && (run.phase !== "choice" || rolled === `${runSerial}:${run.metrics.cards.length}`)) return;
  shownPhase = run.phase;
  if (run.phase !== "playing") notice.classList.remove("visible");
  overlay.hidden = run.phase === "playing"; intro.hidden = true;
  const reward = run.phase === "choice" || run.phase === "general";
  overlay.classList.toggle("reward", reward);
  element("pause").classList.remove("has-cards");
  if (reward) { dealtAt = performance.now(); playSfx("levelup"); element("building").hidden = true; }
  choices.hidden = run.phase !== "choice" && run.phase !== "general";
  result.hidden = run.phase !== "won" && run.phase !== "lost";
  if (run.phase === "general") {
    cards.replaceChildren(...run.generalOffers.map(general => {
      const button = document.createElement("button"); button.className = "card awaken epic"; button.dataset["general"] = general;
      button.innerHTML = generalCard(general);
      tap(button, () => pick(button, CENTER, () => { if (run?.phase === "general") effects.push(...chooseGeneral(run, general)); }));
      return button;
    }));
  }
  if (run.phase === "choice") {
    const offer = `${runSerial}:${run.metrics.cards.length}`, spin = offer !== rolled && !calm && !saved.motionOff, reels: (() => void)[] = [];
    rolled = offer;
    cards.replaceChildren(...run.offers.map((card, order) => {
      const text = cardText(run!, card), button = document.createElement("button");
      const family = card.startsWith("recruit-") ? "recruit" : card.startsWith("hero-") || card.startsWith("promote-") ? "hero" : card.startsWith("awaken-") ? "awaken" : card === "arrow" || card === "hwacha" ? "weapon" : card;
      const rarity = cardRarity(card);
      button.className = `card ${family} ${rarity}`; button.dataset["card"] = card;
      const owner = card.startsWith("awaken-") ? run!.squads.find(squad => squad.general === card.slice(7)) : card.startsWith("promote-") ? run!.squads.find(squad => squad.general === card.slice(8)) : undefined;
      const target: Point = owner ?? (card.startsWith("recruit-") ? fewest(run!) : CENTER);
      button.setAttribute("aria-label", tr`${text.name}: ${text.line}`);
      const name = card.startsWith("recruit-") ? SOLDIER_NAMES[card.slice(8) as SoldierKind] : text.name;
      const face = button.innerHTML = family === "hero" ? generalCard(card.slice(card.startsWith("hero-") ? 5 : 8) as General, text.pips ?? 1)
        : `<span class="card-illustration${family === "weapon" ? " walled" : ""}">${cardArt(card)}</span><strong class="card-name" data-ko="${name}">${t(name)}</strong>`;
      reels.push(() => roll(button, order, cardArt(card), face, rarity));
      tap(button, () => pick(button, target, () => { if (run?.phase === "choice" && run.offers.includes(card)) { effects.push(...choose(run, card)); if (card === "rift") crack(); } }));
      return button;
    }));
    if (spin) { reels.forEach(start => start()); playSfx("tick"); }
    if (!saved.record.plays && !run.metrics.cards.length) cards.insertAdjacentHTML("beforeend", `<img class="touch-cue" src="${pixelIcon("touch")}" alt="" />`);
  }
  if (run.phase === "won" || run.phase === "lost") {
    result.classList.toggle("lost", run.phase === "lost");
    const outcome = run.phase === "won" ? "승리" : "패배";
    element("result-title").innerHTML = `<img src="${pixelIcon(run.phase === "won" ? "trophy" : "skull")}" alt="" /><b data-ko="${outcome}">${t(outcome)}</b>`;
    result.querySelector<HTMLImageElement>(".commander")!.src = `./art/portraits/${portrait(run.commander)}.png`;
    element("building").hidden = true;
    element("result-time").textContent = `${Math.floor(run.time / 60)}:${String(Math.floor(run.time % 60)).padStart(2, "0")}`;
    element("result-score").textContent = run.earned.toLocaleString("ko-KR");
    const record = saved.record, ending = `${runSerial}:${run.phase}`;
    if (settled !== ending) {
      settled = ending;
      const hold = run.phase === "lost" ? DEFEAT_HOLD : 0;
      const tally = element("result-merit");
      const before = new Set(bphSave.unlockedGenerals);
      let merit = run.endless ? 0 : run.bph ? run.bph.pendingMastery : meritFor(run.kills, run.time, run.metrics.bosses.filter(boss => boss.fallen !== null).length);
      if (!run.endless) {
        record.plays++; record.kills = Math.max(record.kills, run.kills); record.score = Math.max(record.score, run.earned);
        if (run.phase === "won") { record.wins++; record.fastest = record.fastest ? Math.min(record.fastest, run.time) : run.time; }
        keep();
        if (run.bph) {
          settleBphRun(meta, run);
          recordBphProgress(bphSave, { kind: "run-ended", seconds: run.time, won: run.phase === "won" });
        } else merit = award(meta, merit, { seconds: run.time, won: run.phase === "won" });
        keepMeta(meta);
      }
      const unlocked = availableGenerals.filter(general => bphSave.unlockedGenerals.includes(general) && !before.has(general));
      tally.parentElement!.hidden = run.endless;
      tally.hidden = !run.bph;
      element("result-merit-fill").parentElement!.hidden = Boolean(run.bph);
      element("result-merit-fill").style.width = `${Math.min(1, merit / Math.max(1, nextUnlocks(meta)[0]?.cost ?? merit)) * 100}%`;
      const since = performance.now() + hold, roundMerit = run.bph ? Math.floor : Math.round;
      const climb = () => {
        const share = Math.max(0, Math.min(1, (performance.now() - since) / DEAL.tally));
        tally.textContent = String(roundMerit(merit * share));
        if (share < 1) requestAnimationFrame(climb);
      };
      setTimeout(climb, hold);
      stopBgm(); playSfx(run.phase === "won" ? "win" : "lose");
      if (run.phase === "lost") defeat();
      if (unlocked.length) setTimeout(() => requestAnimationFrame(() => {
        if (settled !== ending || result.hidden) return;
        showResultUnlocks(unlocked, element("retry")); playSfx("evolve");
      }), hold);
      if (run.bph) {
        const summary = document.createElement("p");
        summary.textContent = tr`처치 ${run.kills} · 강화 포인트 +${Math.floor(merit)}`;
        element("result-damage").replaceChildren(summary);
      } else element("result-damage").replaceChildren(diagnosis(run, meta));
      element("result-upgrade").classList.toggle("ready", META_NODES.some(entry => canBuy(meta, entry.id)));
    }
  }
}
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
function begin(seed: number, demoRun: boolean, entry: {
  readonly general: General; readonly endless?: boolean;
} = { general: startingGeneral }): void {
  const { general } = entry;
  const arena = element("arena");
  setFieldSize(Math.round(800 * arena.clientWidth / arena.clientHeight / 2) * 2, 800);
  game.scale.setGameSize(WIDTH, HEIGHT);
  game.scale.setParentSize(arena.clientWidth, arena.clientHeight);
  attract = demoRun;
  if (!demoRun) closeBphRelicToast();
  const selected = BPH_GENERALS.find(name => name === general) ?? "권율";
  run = demoRun ? createRun(seed, general, undefined, availableGenerals)
    : createBphRun(meta, { seed, general: selected, upgrades: activeBphEffects(bphSave), endless: entry.endless });
  if (entry.endless) enterEndless(run);
  weatherHud.start(run.weather, !demoRun);
  bphField.replaceChildren(); updateBphField = undefined;
  if (!demoRun) {
    const battle = run;
    prepareBphFieldShop(battle);
    updateBphField = renderBphField(bphField, battle, () => {
      keepMeta(meta);
    });
  }
  if (demoRun) stopBgm();
  setBgmScene(demoRun ? "title" : "battle");
  if (!demoRun) startBgm();
  feedback = freshFeedback(); effects = []; aims = []; shownPhase = "ready"; runSerial++; paused = false; picking = false; leveled = 1;
  app.classList.toggle("titled", demoRun); app.classList.toggle("fronted", demoRun && !logo.hidden); notice.classList.remove("visible");
  titleLayer.hidden = !demoRun;
  reelStrip.hidden = true; spun = null; lastReel = -1; drillKey = ""; drills.hidden = demoRun; element("building").hidden = true;
  if (demoRun) {
    overlay.hidden = false; overlay.classList.remove("reward"); setBgmIntensity(0);
    intro.hidden = choices.hidden = result.hidden = true;
  } else {
    updateHud();
    if (!saved.firstBattleGuide) {
      paused = firstBattleGuideOpen = true;
      showFirstBattleGuide(() => {
        saved.firstBattleGuide = true; keep();
        firstBattleGuideOpen = paused = false;
        updateHud(); element("pause").focus();
      });
    }
  }
}
function title(): void {
  if (!attract && run && run.phase !== "won" && run.phase !== "lost" && endBphShopVisit(run)) keepMeta(meta);
  begin(randomSeed(), true);
}
function start(general: General): void {
  startBgm();
  if (!run) {
    queuedStart = general;
    // The DOM picker is ready before Phaser's artwork. Acknowledge the choice
    // immediately; scene creation consumes it without requiring another tap.
    const loading = element("start-loading");
    loading.querySelector("img")!.src = `./art/portraits/${portrait(general)}.png`;
    titleLayer.hidden = picker.hidden = overlay.hidden = true;
    loading.hidden = false;
    return;
  }
  if (!attract) return;
  startingGeneral = general;
  const query = Number(parameters.get("seed"));
  begin(Number.isInteger(query) && query > 0 && query <= 0xffff_ffff ? query : randomSeed(), false, { general });
}
const SKILL_SOUNDS: Record<General, SfxName> = { 권율: "volley", 김시민: "shield", 곽재우: "charge",
  사명대사: "shield", 이순신: "charge",
  황진: "charge", 처영: "shield", 조헌: "volley", 신립: "charge", 이복남: "volley",
  정발: "charge", 송상현: "volley", 신각: "charge", 김명원: "volley", 김여물: "charge", 정담: "charge",
  노개방: "shield", 영규: "charge", 이여송: "charge", 이정헌: "volley", 김희수: "volley", 송봉수: "charge" };
const DIRECT_SOUNDS: Partial<Record<Effect["kind"], SfxName>> = { blast: "blast", telegraph: "telegraph", land: "land", wall: "wall", hurt: "hurt", down: "down", block: "block", interrupt: "block", upgrade: "levelup",
  wave: "horn", evolution: "evolve", rift: "evolve", expand: "levelup", join: "levelup", "boss-enter": "horn", rage: "land", ladder: "wall" };
function cue(effect: Effect, current: Run): void {
  const squad = current.squads[effect.squad ?? -1], direct = DIRECT_SOUNDS[effect.kind];
  if (direct) playSfx(direct);
  else if (effect.kind === "hit" && effect.value > 0) playSfx(effect.critical ? "crit" : effect.minor ? "hit" : "heavy");
  else if (effect.kind === "windup") playSfx("prepare", Math.max(0, effect.value - .08));
  else if (effect.kind === "kill") playSfx("kill", .05);
  else if (effect.kind === "shot") playSfx(effect.by === "hwacha" ? "rocket" : "arrow");
  else if (effect.kind === "skill" && squad) playSfx(SKILL_SOUNDS[squad.general]);
  else if (effect.kind === "prize") playSfx(effect.value >= 3 ? "win" : effect.value >= 2 ? "evolve" : "prize");
}
element("home").addEventListener("click", () => { stage(logo); title(); startBgm(); });
for (const id of ["retry", "barracks-play"]) element(id).addEventListener("click", () => showBphShop());
element("result-upgrade").addEventListener("click", () => { stage(barracks); title(); startBgm(); });
element("endless").addEventListener("click", () => {
  if (!bonusesOf(meta).endless) return;
  begin(randomSeed(), false, { general: startingGeneral, endless: true });
});
document.querySelectorAll<HTMLImageElement>("img[data-icon]").forEach(image => {
  const name = image.dataset["icon"] as IconName;
  image.src = pixelIcon(name);
});
function relabel(): void {
  relabelDom();
  weatherHud.relabel();
  element("toggle-lang").querySelector("img")!.src = pixelIcon(`lang-${language()}`);
  element("menu-language").textContent = t(language() === "ko" ? "한국어" : "영어");
  syncToggles();
  updateBphField?.();
  if (run) syncSkills(run);
  if (run?.bph) element("mastery-earned-value").textContent = tr`강화 포인트 +${run.bph.pendingMastery}`;
  const summary = element("result-damage").querySelector("p");
  if (summary && run?.bph) summary.textContent = tr`처치 ${run.kills} · 강화 포인트 +${Math.floor(run.bph.pendingMastery)}`;
}
element("toggle-lang").addEventListener("click", () => { setLanguage(language() === "ko" ? "en" : "ko"); relabel(); });
relabel();
document.documentElement.style.setProperty("--frame", `url("${new URL(timberFrame(), document.baseURI).href}")`);
function menu(open: boolean, context: "title" | "battle" = "battle"): void {
  if (open) cancelPendingSfx();
  paused = open; overlay.hidden = !open; intro.hidden = !open;
  titleLayer.hidden = open || !attract;
  overlay.classList.toggle("reward", !open && run?.phase === "choice");
  choices.hidden = result.hidden = true; element("building").hidden = true;
  if (!open) { if (attract) overlay.hidden = false; else { shownPhase = "ready"; updateHud(); } }
  element("resume").hidden = !open || context === "title";
  element("home").hidden = !open || context === "title";
  element("settings-close").hidden = !open || context === "battle";
  if (open) {
    notice.classList.remove("visible");
    element(context === "title" ? "toggle-sound" : "resume").focus();
  }
}
element("pause").addEventListener("click", () => { if (run && !paused) menu(true); });
element("resume").addEventListener("click", () => { if (run && paused) { menu(false); element("pause").focus(); } });
element("settings-close").addEventListener("click", () => {
  menu(false); element("title-settings").focus();
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || intro.hidden) return;
  event.preventDefault();
  element(element("settings-close").hidden ? "resume" : "settings-close").click();
});
overlay.addEventListener("click", event => {
  if (event.target !== overlay || intro.hidden || element("settings-close").hidden) return;
  element("settings-close").click();
});
function syncToggles(): void {
  document.querySelectorAll(".toggle-sound").forEach(button => {
    button.setAttribute("aria-pressed", String(!saved.muted));
    button.querySelector("img")!.src = pixelIcon(saved.muted ? "mute" : "sound");
  });
  document.querySelectorAll(".toggle-timers").forEach(button => button.setAttribute("aria-pressed", String(saved.timers)));
  element("toggle-motion").setAttribute("aria-pressed", String(saved.motionOff));
  element("toggle-flashes").setAttribute("aria-pressed", String(saved.flashesOff));
  for (const [id, enabled] of [["toggle-sound", !saved.muted], ["toggle-motion", !saved.motionOff], ["toggle-flashes", !saved.flashesOff]] as const) {
    const button = element(id);
    button.dataset["enabled"] = String(enabled);
    button.querySelector(".toggle-state")!.textContent = t(enabled ? "켜짐" : "꺼짐");
  }
}
document.addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest("button");
  if (button?.classList.contains("toggle-sound")) { saved.muted = !saved.muted; setMuted(saved.muted); }
  else if (button?.classList.contains("toggle-timers")) saved.timers = !saved.timers;
  else if (button?.id === "toggle-motion") saved.motionOff = !saved.motionOff;
  else if (button?.id === "toggle-flashes") saved.flashesOff = !saved.flashesOff;
  else return;
  keep(); syncToggles();
});
syncToggles();

type Trooper = { unitId: number; sprite: Phaser.GameObjects.Sprite; key: string; windFor: number; strikeAt: number; hurtAt: number; fellAt: number; downAt: number; aimX: number; aimY: number; motion: EnemyMotion; faceLeft: boolean };
type Troop = { signature: string; leader: Trooper; troopers: Trooper[] };
type WallTile = { image: Phaser.GameObjects.Image; shape: string; stage: number; x: number; y: number; struckAt: number };
type Order = { fromX: number; fromY: number; x: number; y: number; until: number };
type Raider = { sprite: Phaser.GameObjects.Sprite; x: number; y: number; hits: number; gait: number; taken: boolean };
type Marcher = { squad: Squad; troop: Troop; lap: number; prey: Raider | null; blowAt: number };
/** The scene behind the title: every opened general walks his file round the fort and breaks off to cut down raiders. Distances are field pixels, speeds pixels a second. */
const PARADE = { ring: 44, pace: 30, rush: 72, spacing: 22, file: 3, reach: 26, beat: 720, sight: 160, raidEvery: 4.5, creep: 20, raiders: 8 };
const RAIDERS = ["yari", "teppo", "samurai"] as const;
/** The point this far along the patrol loop, a rectangle PARADE.ring outside the walls walked clockwise. */
function patrolPoint(lap: number): Point {
  const loop = fortRect(0, PARADE.ring), wide = loop.right - loop.left, tall = loop.bottom - loop.top, round = 2 * (wide + tall), at = (lap % round + round) % round;
  return at < wide ? { x: loop.left + at, y: loop.top } : at < wide + tall ? { x: loop.right, y: loop.top + at - wide }
    : at < 2 * wide + tall ? { x: loop.right - (at - wide - tall), y: loop.bottom } : { x: loop.left, y: loop.bottom - (at - 2 * wide - tall) };
}
/** Where the soldier of this rank marches, trailing his general round the loop. */
const fileSpot = (lap: number, rank: number) => patrolPoint(lap - (rank + 1.5) * PARADE.spacing);
/** Moves a walker toward a spot by at most this many pixels, going round the fort instead of through it. */
function walk(walker: Point, to: Point, far: number): void {
  const next = route(fortRect(0, 14), walker, to), gap = distance(walker, next);
  if (gap <= far) { walker.x = next.x; walker.y = next.y; return; }
  walker.x += (next.x - walker.x) / gap * far; walker.y += (next.y - walker.y) / gap * far;
}

const WALL_LIFT = 32, ENTRANCE_MS = 1100;
class CastleScene extends Phaser.Scene {
  private positions = new Map<Point, Point>();
  private wallLabel: Phaser.GameObjects.Text | null = null;
  private foes = new Map<number, Phaser.GameObjects.Sprite>();
  private strides = new Map<number, EnemyMotion>();
  private missiles = new Map<number, Phaser.GameObjects.Sprite>();
  private troops: Troop[] = [];
  private fortParts: Phaser.GameObjects.GameObject[] = [];
  private ground!: Phaser.GameObjects.Image;
  private river!: Phaser.GameObjects.TileSprite;
  private bank!: Phaser.GameObjects.TileSprite;
  private scenery: Phaser.GameObjects.Image[] = [];
  private wallTiles: WallTile[] = [];
  private keep: { tent: Phaser.GameObjects.Image; flames: Phaser.GameObjects.Sprite[]; stage: number; smokeAt: number } | null = null;
  private yard: { forge: Phaser.GameObjects.Image; flag: Phaser.GameObjects.Image; smokeAt: number; struckAt: number } | null = null;
  private entered = new Map<number, number>();
  private wallWeapons: { kind: "arrow" | "hwacha"; sprite: Phaser.GameObjects.Sprite; slot: Point }[] = [];
  private goldLabel: Phaser.GameObjects.Text | null = null;
  private goldHud!: Phaser.GameObjects.Graphics;
  private emphasis!: BossCamera;
  private goldShown = 0;
  private goldUntil = 0;
  private coins = new Set<Phaser.GameObjects.Image>();
  private bossEntries = new Map<number, number>();
  private orders: Order[] = [];
  private builtFort = -1;
  private serial = -1;
  private bars!: Phaser.GameObjects.Graphics;
  private readonly healthBoxes: HealthBar[] = [];
  private gaugeImages: { frame: Phaser.GameObjects.Image; fill: Phaser.GameObjects.Image }[] = [];
  private gaugeCount = 0;
  private marks!: Phaser.GameObjects.Graphics;
  private danger!: Phaser.GameObjects.Graphics;
  private alarm!: Phaser.GameObjects.Graphics;
  private rain!: Phaser.GameObjects.Graphics;
  private particles = new ParticleCap();
  private density = storm(0);
  private frames = 0;
  private hitStopUntil = 0;
  private lastShake = -1000;
  private readonly damageNumbers = new DamageNumbers();
  private numberSprites: Phaser.GameObjects.Text[] = [];
  private impactBudget = new ImpactBudget();
  private decoration = new DecorationBudget();
  private readonly painted = new PaintedArt(this);
  private wallShield!: WallShield;
  private uniqueSkillView?: UniqueSkillView;
  private skillStage?: SkillStage;
  private readonly held = new Map<Effect, Effect[]>();
  private lastStreak = 0;
  private accumulator = 0;
  private marchers: Marcher[] = [];
  private raiders: Raider[] = [];
  private raidAt = 0;
  constructor() { super("castle"); }
  preload(): void {
    this.painted.preload(PAINTED_FILES);
    const root = import.meta.env.BASE_URL;
    this.load.on("progress", (share: number) => {
      startProgress(share);
      const loading = element("start-loading");
      loading.style.setProperty("--share", String(share));
      loading.setAttribute("aria-valuenow", String(Math.round(share * 100)));
    });
    for (const kind of ["grass", "path"]) for (let variant = 1; variant <= 3; variant++)
      this.load.image(`${kind}-${variant}`, `${root}art/terrain/${kind}_${variant}.png`);
    for (const direction of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) this.load.image(`path-${direction}`, `${root}art/terrain/edge/path_${direction}.png`);
    for (const name of ["brush", "rock", "slope_1"]) this.load.image(name, `${root}art/terrain/${name}.png`);
    for (const shape of ["es", "sw", "ne", "nw", "ns", "ew"]) for (const variant of ["a", "b", "c", "d"])
      this.load.image(`wall-${shape}-${variant}`, `${root}art/props/wall_${shape}_${variant}.png`);
    this.load.image("tree", `${root}art/props/tree.png`);
    this.load.image("gate", `${root}art/props/gate_stone.png`);
    this.load.image("tent", `${root}art/props/tent.png`);
    this.load.image("scorch", `${root}art/anim/scorch.png`);
    for (const kind of [...ownTextures, ...foeTextures]) this.load.spritesheet(kind, `${root}art/units/${bphArtFile(kind)}.png`, { frameWidth: UNIT_FRAME.width, frameHeight: UNIT_FRAME.height });
    for (const kind of SHIP_TEXTURES) this.load.spritesheet(kind, `${root}art/ships/${kind}.png`, { frameWidth: SHIP_FRAME.width, frameHeight: SHIP_FRAME.height });
    this.load.image("river-water", `${root}art/terrain/river.png`);
    this.load.image("river-bank", `${root}art/terrain/riverbank.png`);
    for (const actor of FULL_BOSS_ART) this.load.spritesheet(`boss-sheet-${actor}`, `${root}art/generals/${actor}.webp`,
      { frameWidth: BOSS_FRAME.width, frameHeight: BOSS_FRAME.height });
    for (const actor of FULL_ALLY_ART) this.load.spritesheet(`ally-sheet-${actor}`, `${root}art/generals/${actor}.webp`,
      { frameWidth: BOSS_FRAME.width, frameHeight: BOSS_FRAME.height });
    for (const [key, file, width, height] of [["blast", "fx/blast_big", 64, 64], ["boom", "fx/blast", 32, 32], ["death", "fx/death", 32, 32],
      ["volley", "fx/volley_arc", 32, 32], ["rocket", "fx/volley", 32, 32], ["command", "fx/command", 32, 32], ["slash", "fx/slash", 32, 32],
      ["smoke", "fx/smoke", 32, 32], ["heal", "fx/heal", 32, 32], ["charge", "fx/charge", 32, 32], ["muzzle", "fx/muzzle", 32, 32],
      ["spark", "fx/hit", 32, 32], ["guard", "fx/guard", 32, 32], ["blaze", "anim/fire_blaze", 32, 48],
      [ARROW_ART.key, ARROW_ART.file, ARROW_ART.size, ARROW_ART.size]] as const)
      this.load.spritesheet(key, `${root}art/${file}.png`, { frameWidth: width, frameHeight: height });
    hitFrames.forEach((url, index) => this.load.image(`hit-frame-${index}`, url));
    this.load.font("DNFBitBitv2", `${root}fonts/DNFBitBitv2.otf`, "opentype");
    this.load.on("loaderror", (file: Phaser.Loader.File) => { startFailed(); console.error(`그림 로드 실패: ${file.key}`); });
  }
  private tinted(kind: string, suffix: "white" | "hurt", frame = UNIT_FRAME): void {
    const image = this.textures.get(kind).getSourceImage() as HTMLImageElement, mask = document.createElement("canvas");
    mask.width = image.width; mask.height = image.height;
    const context = mask.getContext("2d"); if (!context) throw new Error("피격 마스크 생성 실패");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, mask.width, mask.height);
    if (suffix === "white") whitenHitPixels(pixels.data);
    else recolorPainted(pixels.data, this.painted.source(`hit-masks-${suffix}`), .5);
    context.putImageData(pixels, 0, 0);
    const texture = this.textures.addCanvas(`${kind}-${suffix}`, mask);
    if (!texture) throw new Error(`중복 피격 마스크: ${kind}`);
    this.textures.addSpriteSheet(`${kind}-${suffix}`, texture, { frameWidth: frame.width, frameHeight: frame.height });
  }
  /** Keep the enemy armor red without tinting the independent Joseon texture. */
  private tintCavalry(): void {
    const image = this.textures.get("cavalry").getSourceImage() as HTMLImageElement, canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d"); if (!context) throw new Error("기병 그림 생성 실패");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    recolorPainted(pixels.data, this.painted.source("enemy-cavalry-red"), 1, at => {
      const paint = pixels.data[at] << 16 | pixels.data[at + 1] << 8 | pixels.data[at + 2];
      return paint !== PALETTE.outline && paint !== PALETTE.dark && pixels.data[at + 3] !== 0
        && pixels.data[at + 2] > pixels.data[at] * 1.1;
    }, { x: 10, y: 7, width: 12, height: 11 });
    context.putImageData(pixels, 0, 0); this.textures.remove("cavalry");
    const texture = this.textures.addCanvas("cavalry", canvas);
    if (!texture) throw new Error("기병 그림 중복");
    this.textures.addSpriteSheet("cavalry", texture, { frameWidth: UNIT_FRAME.width, frameHeight: UNIT_FRAME.height });
  }
  create(): void {
    if (loadingFailed) return;
    this.painted.prepare(PAINTED_FILES);
    this.wallShield = new WallShield(this, this.painted);
    this.uniqueSkillView = new UniqueSkillView(this, this.painted);
    this.skillStage = new SkillStage(this, this.painted, SKILL_SHOWS, CHAOS_SHOWS);
    this.skillStage.shaker = (strength, stop) => this.shake(strength, 0, stop, 200);
    for (const base of Object.values(GENERAL_ART)) {
      const image = this.textures.get(base).getSourceImage() as HTMLImageElement, canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d"); if (!context) throw new Error("장수 그림 생성 실패");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      personalize(base, pixels.data, canvas.width, this.painted); context.putImageData(pixels, 0, 0);
      this.textures.remove(base);
      const texture = this.textures.addCanvas(base, canvas);
      if (!texture) throw new Error("장수 그림 중복");
      this.textures.addSpriteSheet(base, texture, { frameWidth: 32, frameHeight: 32 });
    }
    this.tintCavalry();
    const ladder = document.createElement("canvas"); ladder.width = 64; ladder.height = 32;
    const ladderContext = ladder.getContext("2d");
    if (!ladderContext) throw new Error("사다리병 그림 생성 실패");
    ladderContext.imageSmoothingEnabled = false;
    for (const [index, slug] of ["ladder-unit", "ladder-unit-1"].entries())
      ladderContext.drawImage(this.painted.source(slug), index * 32, 0);
    const ladderTexture = this.textures.addCanvas("ladder", ladder);
    if (!ladderTexture) throw new Error("사다리병 그림 중복");
    this.textures.addSpriteSheet("ladder", ladderTexture, { frameWidth: 32, frameHeight: 32 });
    this.tinted("ladder", "white");
    for (const [slug, parts] of Object.entries({
      "gore-chips": [[3,2,8,10],[13,8,9,10],[4,14,8,9]],
      "hurt-chips": [[12,2,9,10],[2,5,8,9],[12,14,10,9]],
      "wall-debris": [[10,2,12,13],[2,11,8,10],[13,16,9,7]],
      "keep-debris": [[11,2,12,12],[2,10,9,10],[12,15,11,8]],
    })) parts.forEach(([x,y,width,height], index) => this.textures.get(`painted:${slug}`).add(`piece-${index}`, 0, x, y, width, height));
    for (const kind of foeTextures) this.tinted(kind, "white");
    for (const kind of SHIP_TEXTURES) this.tinted(kind, "white", SHIP_FRAME);
    for (const actor of FULL_BOSS_ART) this.tinted(`boss-sheet-${actor}`, "white", BOSS_FRAME);
    for (const kind of ownTextures) this.tinted(kind, "hurt");
    this.numberSprites = this.damageNumbers.slots.map(() => this.add.text(0, 0, "", {
      fontFamily: "DNFBitBitv2", fontSize: "12px", color: "#ffffff", stroke: "#262b44", strokeThickness: 2,
    }).setOrigin(.5, 1).setDepth(LAYER.bars + 2).setVisible(false));
    for (const name of YARD_PICTURES) this.textures.addImage(`yard-${name}`, yardPicture(name, this.painted));
    const ground = this.textures.createCanvas("battle-ground", 22 * TILE, 28 * TILE);
    if (!ground) throw new Error("Duplicate battlefield texture");
    const groundContext = ground.context;
    for (let row = 0; row < 28; row++) for (let column = 0; column < 22; column++)
      groundContext.drawImage(this.textures.get(`grass-${1 + (column * 5 + row * 3 + (column ^ row) % 2) % 3}`).getSourceImage() as HTMLImageElement, column * TILE, row * TILE);
    groundContext.globalAlpha = .9;
    for (const [name, column, row] of [["brush", 0, 2], ["brush", 12, 5], ["rock", 12, 1], ["slope_1", 1, 8], ["brush", 6, 0]] as const)
      groundContext.drawImage(this.textures.get(name).getSourceImage() as HTMLImageElement, column * TILE, row * TILE);
    groundContext.globalAlpha = 1; ground.refresh();
    this.ground = this.add.image(0, 0, "battle-ground").setOrigin(0);
    this.river = this.add.tileSprite(WIDTH / 2, riverBank(), WIDTH, HEIGHT - riverBank(), "river-water").setOrigin(.5, 0).setDepth(3);
    this.bank = this.add.tileSprite(WIDTH / 2, riverBank() - 12, WIDTH, 32, "river-bank").setOrigin(.5, 0).setDepth(4);
    // FIT preserves battle coordinates on resize. Continue the terrain into its CSS grass gutters.
    const arena = element("arena"), canvas = this.game.canvas;
    const backdrop = new ResizeObserver(() => {
      const bounds = canvas.getBoundingClientRect(), field = arena.getBoundingClientRect();
      const scale = bounds.height / HEIGHT;
      arena.style.setProperty("--river-top", `${bounds.top - field.top + (riverBank() - 12) * scale}px`);
      arena.style.setProperty("--river-x", `${bounds.left - field.left}px`);
      arena.style.setProperty("--river-tile", `${32 * scale}px`);
      arena.style.setProperty("--river-offset", `${12 * scale}px`);
      arena.style.setProperty("--river-scale", String(scale));
    });
    backdrop.observe(canvas);
    this.events.once("shutdown", () => backdrop.disconnect());
    this.marks = this.add.graphics().setDepth(LAYER.ground); this.bars = this.add.graphics().setDepth(LAYER.bars);
    this.danger = this.add.graphics().setDepth(LAYER.bars - .5);
    this.alarm = this.add.graphics().setDepth(LAYER.alarm); this.rain = this.add.graphics().setDepth(LAYER.weather);
    this.emphasis = new BossCamera(this, () => !attract && feedbackChannels(saved.motionOff, saved.flashesOff, calm).motion);
    this.goldHud = this.add.graphics().setDepth(LAYER.bars);
    this.emphasis.fixed(this.goldHud);
    const strip = (key: string, texture: string, end: number, frameRate: number, repeat = 0) =>
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(texture, { start: 0, end }), frameRate, repeat });
    strip("explosion", "blast", 5, 20); strip("boom", "boom", 4, 20); strip("fallen", "death", 3, 18);
    strip("command-flash", "command", 3, 16); strip("slash", "slash", 3, 26); strip("puff", "smoke", 3, 12); strip("mend", "heal", 3, 12); strip("rocket-flight", "rocket", 2, 12, -1);
    const cut = document.createElement("canvas"), slash = this.textures.get("slash").getSourceImage() as HTMLImageElement;
    cut.width = slash.width; cut.height = slash.height;
    const cutContext = cut.getContext("2d");
    if (!cutContext) throw new Error("참격 그림 생성 실패");
    cutContext.drawImage(slash, 0, 0);
    const cutPixels = cutContext.getImageData(0, 0, cut.width, cut.height);
    recolorPainted(cutPixels.data, this.painted.source("hit-masks-white"), 1, at =>
      cutPixels.data[at] + cutPixels.data[at + 1] + cutPixels.data[at + 2] >= 200);
    cutContext.putImageData(cutPixels, 0, 0);
    const cutTexture = this.textures.addCanvas("melee", cut);
    if (!cutTexture) throw new Error("중복 참격 그림");
    this.textures.addSpriteSheet("melee", cutTexture, { frameWidth: 32, frameHeight: 32 });
    strip("melee", "melee", 3, 40);
    strip("rush", "charge", 3, 20); strip("muzzle", "muzzle", 2, 24); strip("spark", "spark", 1, 14); strip("blaze", "blaze", 5, 12, 1); strip("ward", "guard", 3, 14);
    for (const [style, actor] of Object.entries(burstActors))
      this.anims.create({ key: `impact-${style}`, frameRate: 20, frames: [0, 1, 2, 3].map(frame => ({ key: hitFrame(actor, frame) })) });
    for (const actor of new Set([...Object.values(strikeActors), ...Object.values(foeStrikes)]))
      this.anims.create({ key: `strike-${actor}`, frameRate: 16, frames: [1, 2].map(frame => ({ key: hitFrame(actor, frame) })) });
    for (const animation of Object.values(ENEMY_ANIMATIONS))
      this.anims.create({ ...animation, frames: animation.frames.map(frame => ({ ...frame })) });
    for (const animation of Object.values(ALLY_ANIMATIONS)) {
      // Pad the 56px source to a logical 64px square: uniform scaling keeps the old centre, feet and bounds.
      if (animation.key.startsWith("ally-full-")) for (const frame of animation.frames)
        this.textures.get(frame.key).get(frame.frame).setTrim(BOSS_FRAME.height, BOSS_FRAME.height,
          (BOSS_FRAME.height - BOSS_FRAME.width) / 2, 0, BOSS_FRAME.width, BOSS_FRAME.height);
      this.anims.create({ ...animation, frames: animation.frames.map(frame => ({ ...frame })) });
    }
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!run || !["playing", "choice"].includes(run.phase) || paused || attract) return;
      const point = this.cameras.main.getWorldPoint(p.x, p.y);
      const reach = (s: Squad) => distance(this.positions.get(s) ?? s, point);
      const squad = run.squads.filter(s => fielded(s) && reach(s) < 44).sort((a, b) => reach(a) - reach(b))[0];
      if (squad && squad.skillClock <= 0) { element("building").hidden = true; fire(squad.id); return; }
      const places = buildings();
      if (distance(point, places.infirmary) < 22) {
        element("building").hidden = true;
        return;
      }
      if (distance(point, places.barracks) < 22 || distance(point, places.forge) < 20) {
        if (run.phase === "choice") return;
        if (run.meta.caps?.drill === 0) return;
        const panel = element("building"); panel.hidden = !panel.hidden;
        element("recruits").hidden = distance(point, places.forge) < 20;
        drills.hidden = !element("recruits").hidden;
        return;
      }
      element("building").hidden = true;
      if (squad) fire(squad.id);
    });
    app.classList.remove("loading");
    element("start-loading").hidden = true;
    title();
    startReady();
    if (!queuedStart) announceBphRelics();
    if (queuedStart) { const general = queuedStart; queuedStart = null; start(general); }
  }
  private reset(): void {
    this.serial = runSerial;
    this.emphasis.reset();
    this.damageNumbers.clear();
    this.skillStage?.clear(); this.held.clear();
    this.numberSprites.forEach(sprite => sprite.setVisible(false));
    for (const coin of this.coins) coin.destroy();
    this.goldShown = 0; this.goldUntil = 0;
    this.entered.clear();
    if (run && !attract) run.squads.forEach((_, id) => this.entered.set(id, this.time.now));
    for (const sprite of this.foes.values()) sprite.destroy();
    for (const sprite of this.missiles.values()) sprite.destroy();
    this.foes.clear(); this.missiles.clear(); this.strides.clear(); this.bossEntries.clear();
    this.troops.forEach(troop => this.disband(troop)); this.troops = [];
    this.marchers.forEach(marcher => this.disband(marcher.troop)); this.raiders.forEach(raider => raider.sprite.destroy());
    this.marchers = attract ? this.rally() : []; this.raiders = []; this.raidAt = this.time.now + 1500;
    this.builtFort = -1; this.accumulator = 0; this.hitStopUntil = 0; this.orders = []; this.impactBudget = new ImpactBudget();
    this.ground.setPosition((CENTER.x - TILE * 1.5) % TILE - TILE, (CENTER.y - TILE * 1.5) % TILE - TILE);
    this.scenery.forEach(prop => prop.destroy());
    this.scenery = [[18, 74], [WIDTH - 18, 52], [70, 34], [22, HEIGHT - 40], [WIDTH - 22, HEIGHT - 54], [WIDTH - 72, HEIGHT - 16]]
      .filter(([, y]) => y < riverBank())
      .map(([x, y]) => this.add.image(x, y, "tree").setOrigin(.5, 1).setDepth(bodyDepth(y - 2)));
    for (const [name, x, y] of [["brush", 44, HEIGHT - 70], ["rock", 2, HEIGHT - 230], ["slope_1", 346, HEIGHT - 250], ["brush", 336, HEIGHT - 60]] as const)
      this.scenery.push(this.add.image(x, y, name).setOrigin(0).setAlpha(.9).setDepth(1));
  }
  private disband(troop: Troop): void {
    troop.leader.sprite.destroy(); troop.troopers.forEach(trooper => trooper.sprite.destroy());
  }
  /** The title parade: each opened general with a file of his own arm, spaced evenly round the patrol loop. */
  private rally(): Marcher[] {
    const generals = availableGenerals.slice(0, opened()), loop = fortRect(0, PARADE.ring), round = 2 * (loop.right - loop.left + loop.bottom - loop.top);
    return generals.map((general, order) => {
      const squad = createRun(1, general).squads[0], lap = round * order / generals.length;
      while (squad.soldiers.length < PARADE.file) squad.soldiers.push({ ...squad.soldiers[0] });
      Object.assign(squad, patrolPoint(lap));
      squad.soldiers.forEach((unit, rank) => { Object.assign(unit, fileSpot(lap, rank)); unit.perch = undefined; });
      return { squad, troop: this.muster(squad, ""), lap, prey: null, blowAt: 0 };
    });
  }
  /** A parade blow: the striker's own attack frame and lunge, then the cut or the arrow landing on the raider. */
  private spar(trooper: Trooper, unit: Unit, raider: Raider, actor: string | undefined): void {
    const left = raider.x < unit.x;
    trooper.strikeAt = this.time.now; trooper.aimX = raider.x; trooper.aimY = raider.y;
    if (actor) {
      this.melee(raider.x, raider.y, left);
    } else {
      const flight = shotArt("arrow", Phaser.Math.Angle.Between(unit.x, unit.y, raider.x, raider.y));
      const arrow = this.add.sprite(unit.x, unit.y - 6, flight.key, flight.frame).setDepth(LAYER.impact + 15);
      this.tweens.add({ targets: arrow, x: raider.x, y: raider.y, duration: 160, onComplete: () => arrow.destroy() });
    }
  }
  private parade(current: Run, seconds: number): void {
    const now = this.time.now, wall = fortRect(0, PARADE.ring / 2);
    if (now >= this.raidAt && this.raiders.length < PARADE.raiders) {
      this.raidAt = now + PARADE.raidEvery * 1000 * (.7 + Math.random() * .6);
      const fromLeft = Math.random() < .5, row = CENTER.y + Phaser.Math.Between(-100, 100);
      for (let rank = Phaser.Math.Between(2, 3); rank > 0; rank--) {
        const x = fromLeft ? -14 - rank * 18 : WIDTH + 14 + rank * 18, y = row + rank % 2 * 12;
        this.raiders.push({ sprite: this.add.sprite(x, y, RAIDERS[Phaser.Math.Between(0, RAIDERS.length - 1)]), x, y, hits: 0, gait: rank * 3, taken: false });
      }
    }
    for (const marcher of this.marchers) {
      const { squad, troop } = marcher;
      marcher.prey ??= this.raiders.filter(raider => !raider.taken && Math.abs(raider.x - CENTER.x) < CENTER.x - 30 && distance(raider, squad) < PARADE.sight).sort((a, b) => distance(a, squad) - distance(b, squad))[0] ?? null;
      const prey = marcher.prey, home = patrolPoint(marcher.lap), onLoop = distance(squad, home) < 3;
      if (prey) {
        prey.taken = true;
        const inward = prey.x < CENTER.x ? 1 : -1, barred = gapToRect(fortRect(0, 14), { x: prey.x + inward * PARADE.reach, y: prey.y }) < 4;
        const side = barred ? -inward : inward, stand = { x: prey.x + side * PARADE.reach, y: prey.y };
        walk(squad, stand, PARADE.rush * seconds);
        squad.soldiers.forEach((unit, rank) => walk(unit, { x: squad.x, y: squad.y + (rank % 2 ? 1 : -1) * PARADE.spacing * Math.ceil((rank + 1) / 2) }, PARADE.rush * seconds));
        if (distance(squad, stand) < 2 && now >= marcher.blowAt) {
          marcher.blowAt = now + PARADE.beat;
          this.spar(troop.leader, squad, prey, strikeActors[squad.general]);
          squad.soldiers.forEach((unit, rank) => this.time.delayedCall(140 * (rank + 1), () => {
            if (attract && marcher.prey === prey && distance(unit, prey) < 80) this.spar(troop.troopers[rank], unit, prey, strikeActors[unit.kind]);
          }));
          if (++prey.hits >= 2) this.time.delayedCall(PARADE.beat / 2, () => this.rout(prey));
        }
      } else {
        if (onLoop) marcher.lap += PARADE.pace * seconds;
        walk(squad, patrolPoint(marcher.lap), (onLoop ? PARADE.pace : PARADE.rush) * seconds);
        squad.soldiers.forEach((unit, rank) => walk(unit, fileSpot(marcher.lap, rank), PARADE.rush * seconds));
      }
      this.pose(troop.leader, squad, current, false, now / 1000);
      squad.soldiers.forEach((unit, rank) => this.pose(troop.troopers[rank], unit, current, false, now / 1000));
    }
    for (const raider of this.raiders) {
      const fought = this.marchers.some(marcher => marcher.prey === raider && distance(marcher.squad, raider) < PARADE.reach + 6), from = { x: raider.x, y: raider.y };
      if (!fought) walk(raider, { x: Phaser.Math.Clamp(raider.x, wall.left, wall.right), y: Phaser.Math.Clamp(raider.y, wall.top, wall.bottom) }, PARADE.creep * seconds);
      const travel = distance(from, raider);
      raider.gait += travel;
      raider.sprite.setPosition(raider.x, raider.y - (travel ? stepHop(raider.gait) : 0)).setFrame(travel ? stepsWalked(raider.gait) % 2 : Math.floor(now / 400) % 2)
        .setFlipX(Math.abs(raider.x - from.x) > .01 ? spriteFlipX(raider.sprite.texture.key, raider.x < from.x) : raider.sprite.flipX).setDepth(bodyDepth(raider.y));
    }
  }
  private rout(raider: Raider): void {
    if (!this.raiders.includes(raider)) return;
    this.raiders = this.raiders.filter(other => other !== raider);
    for (const marcher of this.marchers) if (marcher.prey === raider) marcher.prey = null;
    this.once(raider.x, raider.y, "death", "fallen", 1, 712);
    this.tweens.add({ targets: raider.sprite, angle: raider.sprite.flipX ? -90 : 90, y: raider.sprite.y + 6, alpha: 0, duration: 190, ease: "Quad.In", onComplete: () => raider.sprite.destroy() });
  }
  private once(x: number, y: number, texture: string, animation: string, scale = 1, depth = 720): Phaser.GameObjects.Sprite | undefined {
    if (!this.particles.grant(1, 1) || !this.decoration.acquire("sprite")) return;
    const sprite = this.add.sprite(x, y, texture).setScale(Math.max(1, Math.round(scale))).setDepth(LAYER.impact + Math.max(0, Math.min(99, depth - 700))).play(animation);
    this.particles.live++;
    sprite.once("destroy", () => { this.particles.live--; this.decoration.release("sprite"); });
    sprite.once("animationcomplete", () => sprite.destroy());
    return sprite;
  }
  /** Ordinary contact, shared by every fighter: below bodies, never a skill-sized overlay. */
  private melee(x: number, y: number, left: boolean): void {
    this.once(x, y - 4, "melee", "melee")?.setScale(.5).setAlpha(.65).setFlipX(left).setDepth(LAYER.ground + 1);
  }
  private buildFort(level: number): void {
    this.wallShield.clear();
    this.fortParts.forEach(part => part.destroy()); this.fortParts = []; this.wallTiles = []; this.wallWeapons = []; this.builtFort = level;
    const [columns, rows] = FORT_TILES[level], left = CENTER.x - columns * TILE / 2, top = CENTER.y - rows * TILE / 2;
    const place = (x: number, y: number, key: string, depth: number) => {
      const image = this.add.image(x, y, key).setOrigin(0).setDepth(depth); this.fortParts.push(image); return image;
    };
    for (let row = 0; row <= rows; row++) for (let column = 0; column < columns; column++)
      place(left + column * TILE, top + row * TILE, `path-${1 + Math.abs(column * 3 + row * 5) % 3}`, 1);
    for (let column = 0; column < columns; column++) {
      place(left + column * TILE, top - TILE, "path-n", 1); place(left + column * TILE, top + (rows + 1) * TILE, "path-s", 1);
    }
    for (let row = 0; row <= rows; row++) {
      place(left - TILE, top + row * TILE, "path-w", 1); place(left + columns * TILE, top + row * TILE, "path-e", 1);
    }
    place(left - TILE, top - TILE, "path-nw", 1); place(left + columns * TILE, top - TILE, "path-ne", 1);
    place(left - TILE, top + (rows + 1) * TILE, "path-sw", 1); place(left + columns * TILE, top + (rows + 1) * TILE, "path-se", 1);
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      if (row > 0 && row < rows - 1 && column > 0 && column < columns - 1) continue;
      const shape = row === 0 ? column === 0 ? "es" : column === columns - 1 ? "sw" : "ew"
        : row === rows - 1 ? column === 0 ? "ne" : column === columns - 1 ? "nw" : "ew" : "ns";
      const x = left + column * TILE, y = top + (row + 1) * TILE, isGate = row === rows - 1 && column === (columns - 1) / 2;
      const image = this.add.image(x, y, isGate ? "gate" : `wall-${shape}-a`).setOrigin(0, 1).setDepth(bodyDepth(y - 6));
      this.wallShield.add(image);
      this.fortParts.push(image);
      if (!isGate) this.wallTiles.push({ image, shape, stage: 0, x: x + TILE / 2, y: y - TILE / 2, struckAt: -1000 });
    }
    const places = buildings();
    const raise = (key: string, x: number, y: number, behind = 4) => {
      const image = this.add.image(x, y, key).setOrigin(.5, 1).setDepth(bodyDepth(y - behind)); this.fortParts.push(image); return image;
    };
    const tent = raise("tent", places.base.x, places.base.y).setScale(1.5).setTint(PALETTE.silver);
    const flames = [-12, 10, -2].map((dx, i) => this.add.sprite(places.base.x + dx, places.base.y - 10 - i * 8, "blaze").setDepth(bodyDepth(places.base.y - 2)).setScale(.8 + i * .15).play({ key: "blaze", repeat: -1, startFrame: i * 2 }).setVisible(false));
    this.fortParts.push(...flames);
    this.keep = { tent, flames, stage: 0, smokeAt: 0 };
    raise("yard-rack", places.barracks.x - 9, places.barracks.y - 12);
    raise("tent", places.barracks.x, places.barracks.y);
    raise("yard-hall", places.infirmary.x, places.infirmary.y);
    this.yard = { forge: raise("yard-forge0", places.forge.x, places.forge.y), flag: raise("yard-flag0", places.infirmary.x + 4, places.infirmary.y - 43, -40).setOrigin(8 / 32, 12 / 32), smokeAt: 0, struckAt: -1e9 };
    const signs = this.add.graphics().setDepth(bodyDepth(CENTER.y + 24));
    this.painted.draw(signs, "keep-flag", places.base.x - 4, places.base.y - 35);
    this.fortParts.push(signs);
    for (const slot of weaponSlots(level)) {
      const sprite = this.add.sprite(slot.x, slot.y - WALL_LIFT, slot.kind === "arrow" ? "archer" : "hwacha", 0).setFlipX(slot.x < CENTER.x).setDepth(bodyDepth(fortRect(level).bottom + TILE));
      this.fortParts.push(sprite); this.wallWeapons.push({ kind: slot.kind, sprite, slot });
    }
  }
  private shake(strength = .004, flash = 0, stop = 0, glow = 180): void {
    if (attract) return;
    const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
    const major = stop >= 70, impact = this.impactBudget.request(this.time.now, major, !channels.motion);
    if (impact.allowed) playSfx(major ? "drum" : "impact");
    if (impact.stop > 0) {
      this.hitStopUntil = Math.max(this.hitStopUntil, this.time.now + impact.stop); feedback.hitStops.push(impact.stop);
      feedback.hitStopEvents.push({ at: this.time.now, ms: impact.stop });
    }
    if (impact.allowed) {
      feedback.shakes++;
    }
    if (!flash || !channels.flash) return;
    feedback.screenFlashes++; feedback.viewportFlashes++;
    const veil = element("screen-flash");
    veil.getAnimations().forEach(animation => animation.cancel());
    veil.hidden = false;
    veil.animate([{ opacity: Math.min(.7, flash) }, { opacity: 0 }], { duration: 80 }).onfinish = () => { veil.hidden = true; };
  }
  private burst(x: number, y: number, size: number, style: BurstStyle = "flame"): void {
    const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
    if (!channels.motion || !channels.flash) return;
    if (style === "flame" && !this.decoration.allow("blast", this.time.now, 4)) return;
    if (!this.decoration.acquire("burst")) return;
    feedback.burstTypes[style]++;
    const plume = style === "flame" ? this.once(x, y - 8 * size, "blast", "explosion", size, 730)
      : style === "powder" ? this.once(x, y, "smoke", "puff", size * 1.5, 730)
        : this.once(x, y - 8, "command", "command-flash", size * 2, 730);
    const contact = this.once(x, y, hitFrame(burstActors[style], 0), `impact-${style}`, style === "evolution" ? 2 : 1, 735);
    const sprites = [plume, contact].filter(sprite => sprite !== undefined);
    let remaining = sprites.length;
    if (!remaining) this.decoration.release("burst");
    for (const sprite of sprites) sprite.once("destroy", () => { if (--remaining === 0) this.decoration.release("burst"); });
  }
  private range(x: number, y: number, radius: number): void {
    if (!this.decoration.allow("range", this.time.now, 3)) return;
    const mark = this.add.graphics().setDepth(LAYER.ground);
    paintedRange(mark, this.painted, "range-friendly", x, y, radius, .3);
    feedback.rings++;
    this.tweens.add({ targets: mark, alpha: 0, duration: 400, onComplete: () => mark.destroy() });
  }
  private scorch(x: number, y: number): void {
    if (!this.decoration.acquire("scorch")) return;
    const mark = this.add.image(x, y, "scorch").setDepth(6).setAlpha(.7);
    mark.once("destroy", () => this.decoration.release("scorch"));
    this.tweens.add({ targets: mark, alpha: 0, delay: 2600, duration: 900, onComplete: () => mark.destroy() });
  }

  private trooperOf(effect: Effect): Trooper | undefined {
    const troop = effect.squad === undefined ? undefined : this.troops[effect.squad];
    return effect.index === undefined ? undefined : effect.index < 0 ? troop?.leader : troop?.troopers[effect.index];
  }
  /** The rules resolve a skill on its cast tick. With motion on, a staged skill's own results wait in its show until its picture lands and then join that frame's effects. */
  private stage(batch: Effect[], current: Run, motion: boolean, delta: number, cssPixel: number): Effect[] {
    const waiting = new Set<Effect>();
    if (motion) batch.forEach((effect, index) => {
      const show = effect.kind === "skill" ? this.skillStage?.staged(current.squads[effect.squad ?? -1]?.general, effect) : undefined;
      const waits = show?.waits;
      if (!waits) return;
      const results = castResults(batch, index).filter(item => !waiting.has(item) && batch.includes(item) && waits(item));
      for (const item of results) waiting.add(item);
      this.held.set(effect, results);
    });
    const { shown } = holdBack(batch, waiting);
    const landed = this.skillStage?.update(delta, { cssPixel, run: current, at: unit => this.positions.get(unit) ?? unit, foe: id => this.foes.get(id), band: bannerBand(this.game.canvas, cssPixel),
      channels: feedbackChannels(saved.motionOff, saved.flashesOff, calm) }) ?? [];
    return landed.length ? [...shown, ...landed] : shown;
  }
  private skill(effect: Effect, current: Run): void {
    const squad = current.squads[effect.squad ?? 0];
    const tier = Math.max(growthTier(current.level), squad.tier, growthFor(squad.general, current).tier), scale = 1 + (tier - 1) * .25;
    feedback.skillBursts++;
    feedback.largestSkillScale = Math.max(feedback.largestSkillScale, scale);
    this.once(squad.x, squad.y - 14, "command", "command-flash", 2 * scale, 760);

    const stage = this.skillStage, show = stage?.staged(squad.general, effect);
    if (stage && show) {
      // The rules have already resolved this skill; stage() held its own results until the show's picture lands.
      stage.cast(squad.general, { skill: effect, results: this.held.get(effect) ?? [], run: current, squad, from: this.positions.get(squad) ?? squad, tier,
        channels: feedbackChannels(saved.motionOff, saved.flashesOff, calm), density: this.particles.headroom() }, id => this.foes.get(id));
      this.held.delete(effect); feedback.rings++;
      return;
    }
    if (current.bph && squad.general === "이순신" && effect.shape === "lane") {
      const ship = this.add.sprite(effect.fromX ?? 24, effect.fromY ?? effect.y, "geobukseon", 28)
        .setDepth(LAYER.impact + 35).setScale(1);
      this.tweens.add({ targets: ship, x: effect.x, y: effect.y, duration: 1200,
        delay: (effect.index ?? 0) * 1200, ease: "Linear",
        onComplete: () => ship.destroy() });
    } else if (squad.general === "김시민") {
      for (const mate of current.squads) if (fielded(mate)) this.once(mate.x, mate.y - 6, "guard", "ward", 2 * scale, 761);
      this.shake(.008, 0, 90, 200);
    } else if (squad.general === "송상현" || squad.general === "곽재우") {
      // The persistent line and summoned bodies are drawn from simulation state.
      return;
    } else {
      this.burst(effect.x, effect.y, 1.3 * scale, "evolution");
      this.range(effect.x, effect.y, effect.value);
      this.shake(.01, 0, 90);
    }
  }
  private show(effect: Effect, current: Run): void {
    const now = this.time.now, striker = this.trooperOf(effect);
    if (effect.kind === "boss-enter") {
      if (effect.target !== undefined) this.bossEntries.set(effect.target, now);
      feedback.bossEntrances++;
      const veil = this.add.graphics().setDepth(LAYER.veil).setAlpha(calm ? .25 : .6);
      this.painted.draw(veil, "boss-entry-veil-fill", 0, 0, { width: WIDTH, height: HEIGHT,
        source: { x: 8, y: 8, width: 16, height: 16 } });
      this.tweens.add({ targets: veil, alpha: 0, duration: 850, onComplete: () => veil.destroy() });
      this.time.delayedCall(430, () => {
        this.burst(effect.x, effect.y + 14, effect.value, "powder");
        this.shake(.018, current.enemies.some(enemy => enemy.id === effect.target && enemy.kind === "ukita") ? .22 : 0, 0); playSfx("land");
      });
    } else if (effect.kind === "rage") {
      feedback.bossRages++;
      this.burst(effect.x, effect.y, 2, "flame"); this.shake(.018);
    } else if (effect.kind === "ladder") {
      const ladder = this.add.graphics().setDepth(LAYER.impact + 35);
      this.painted.draw(ladder, "ladder-effect", effect.x - 12, effect.y - 30, { width: 24, height: 60 });
      this.tweens.add({ targets: ladder, alpha: 0, delay: 2400, duration: 400, onComplete: () => ladder.destroy() });
    } else if (effect.kind === "windup" && striker) {
      striker.windFor = effect.value * 1000; striker.aimX = effect.x; striker.aimY = effect.y; feedback.windups++;
    } else if (effect.kind === "swing") {
      const from = { x: effect.fromX ?? effect.x, y: effect.fromY ?? effect.y }, left = effect.x < from.x;
      // pose() already plays the striker's contact frame and lunge.
      this.melee(effect.x, effect.y, left);
      feedback.strikeFrames++;
      feedback.swings++; feedback.hitFrames++;
    } else if (effect.kind === "shot") {
      const from = { x: effect.fromX ?? effect.x, y: effect.fromY ?? effect.y };
      if (effect.by === "hwacha") this.once(from.x, from.y - WALL_LIFT - 4, "smoke", "puff", 1, from.y + 60);
      if (effect.hostile) {
        this.once(from.x, from.y - 4, "muzzle", "muzzle", 1, 716)?.setFlipX(effect.x < from.x);
        if (effect.minor) this.tracer(from, effect);
      } else if (effect.value >= 1) this.once(from.x, from.y - 6, "smoke", "puff", 1, 716);
    } else if (effect.kind === "blast") {
      const scale = Math.max(1, Math.min(3, effect.value));
      this.once(effect.x, effect.y - 4, effect.value >= 1.4 ? "blast" : "boom", effect.value >= 1.4 ? "explosion" : "boom", scale, 718); feedback.chains++;
      feedback.largestBlastScale = Math.max(feedback.largestBlastScale, scale);
      if (effect.value >= 1.4) this.scorch(effect.x, effect.y);
    } else if (effect.kind === "devastate") {
      feedback.bigCrits++;
    } else if (effect.kind === "kill") {
      const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
      const body = effect.target === undefined ? undefined : this.foes.get(effect.target);
      if (body) {
        if (channels.motion) this.tweens.add({ targets: body, alpha: 0, duration: 167 });
        else body.setVisible(false);
      }
      feedback.debris += emitContactParticles({ scene: this, particles: this.particles, decoration: this.decoration, channels }, effect);
      if (effect.value > 0) { this.burst(effect.x, effect.y, 1, "powder"); feedback.chains++; }
    } else if (effect.kind === "lunge") {
      const foe = effect.target === undefined ? undefined : this.foes.get(effect.target);
      feedback.lunges++;
      const actor = foe && !effect.minor ? foeStrikes[foe.texture.key.replace(/-white$/, "")] : undefined;
      if (foe && actor) this.time.delayedCall(effect.value * 1000, () => {
        if (!foe.active) return;
        const left = effect.x < foe.x, size = foe.scaleX >= 1.9 ? 2 : 1;
        this.once(foe.x + (left ? -6 : 6) * size, foe.y - 8 * size, hitFrame(actor, 1), `strike-${actor}`, size, foe.y + 40)?.setFlipX(left);
      });
    } else if (effect.kind === "hurt") {
      const leader = effect.index === -1;
      this.melee(effect.x, effect.y, true);
      const heavy = leader && effect.value >= 60;
      feedback.hurtFlashes++;
    } else if (effect.kind === "block") {
      this.once(effect.x, effect.y - 6, "guard", "ward", 1, 762); feedback.blocks++;
    } else if (effect.kind === "down") {
      if (effect.index === -1) {

        this.once(effect.x, effect.y, "smoke", "puff", 2, 763);
      } else this.once(effect.x, effect.y, "smoke", "puff", 1, 763);
    } else if (effect.kind === "fall") {
      if (striker) striker.fellAt = now;
      this.once(effect.x, effect.y + 2, "smoke", "puff", 1.3, effect.y + 6); feedback.falls++;
    } else if (effect.kind === "rise") {
      if (effect.squad !== undefined) this.entered.set(effect.squad, this.time.now);
      this.once(effect.x, effect.y, "heal", "mend", 2, 763);
    } else if (effect.kind === "skill") {
      const caster = effect.squad === undefined ? undefined : this.troops[effect.squad]?.leader;
      if (caster) { caster.strikeAt = now; caster.aimX = effect.x; caster.aimY = effect.y; }
      this.skill(effect, current);
    }
    else if (effect.kind === "interrupt") {

      this.once(effect.x, effect.y - 10, "spark", "spark", 1, 764); feedback.interrupts++;
    } else if (effect.kind === "telegraph") {
      if (effect.target !== undefined) this.foes.get(effect.target)?.setData("castAt", now);
      const ship = current.enemies.find(enemy => enemy.id === effect.target && enemy.kind === "ship");
      if (ship) this.once(ship.x, ship.y - 6, "muzzle", "muzzle", 1.5, ship.y + 80);
      feedback.telegraphs++;
    } else if (effect.kind === "land") {
      feedback.landings++;
      const spots: Point[] = effect.shape === "lane"
        ? [.3, .55, .8, 1].map(share => ({ x: (effect.fromX ?? effect.x) + (effect.x - (effect.fromX ?? effect.x)) * share, y: (effect.fromY ?? effect.y) + (effect.y - (effect.fromY ?? effect.y)) * share }))
        : [0, 1, 2, 3].map(i => ({ x: effect.x + Math.cos(i * 1.6) * effect.value * (i ? .5 : 0), y: effect.y + Math.sin(i * 1.6) * effect.value * (i ? .5 : 0) }));
      if (effect.minor) {
        for (const spot of spots) this.once(spot.x, spot.y - 6, "guard", "ward", 2, 764);

      } else {
        for (const spot of spots) { this.burst(spot.x, spot.y, 1.2, "flame"); this.scorch(spot.x, spot.y); }
      }
    } else if (effect.kind === "stun") {
      const foe = effect.target === undefined ? undefined : this.foes.get(effect.target);
      foe?.setData("stunUntil", now + effect.value * 1000);
    } else if (effect.kind === "rift" || effect.kind === "evolution" || effect.kind === "wave" || effect.kind === "expand") {
      const wall = fortRect(current.fort, 34), ring = effect.kind === "wave" ? 12 : 10;
      for (let i = 0; i < ring; i++) this.time.delayedCall(i * 45, () => {
        const along = i / ring * Math.PI * 2;
        const x = CENTER.x + Math.cos(along) * (wall.right - wall.left) * .62, y = CENTER.y + Math.sin(along) * (wall.bottom - wall.top) * .62;
        if (effect.kind === "expand") { this.once(x, y, "smoke", "puff", 2, 740); feedback.smoke++; }
        else this.burst(x, y, 1.3, effect.kind === "evolution" ? "evolution" : i % 2 ? "powder" : "flame");
      });
      if (effect.kind === "expand") this.shake(.012);
      feedback.chains += ring;
    } else if (effect.kind === "rout") {
      this.range(effect.x, effect.y, effect.value);
      for (let i = 0; i < 8; i++) this.time.delayedCall(i * 60, () => this.burst(effect.x + Phaser.Math.Between(-40, 40), effect.y + Phaser.Math.Between(-40, 40), 1.5, i % 2 ? "evolution" : "flame"));
      this.shake(.014, .7, 90, 420);
    } else if (effect.kind === "join") {
      if (effect.value === 1 && effect.squad !== undefined) this.entered.set(effect.squad, this.time.now);
      this.once(effect.x, effect.y - 10, "command", "command-flash", 2, 745);

    } else if (effect.kind === "coin") {
      if (effect.value <= 0) return;
      const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
      if (!channels.motion) { playSfx("coin"); return; }
      const merged = [...this.coins].find(coin => now - Number(coin.getData("born")) < 120 && coin.getData("minor") === effect.minor);
      if (merged) {
        const amount = Number(merged.getData("amount")) + effect.value;
        merged.setData("amount", amount);
        const label = merged.getData("label");
        if (label instanceof Phaser.GameObjects.Text) label.setText(`+${amount}`);
        return;
      }
      if (this.coins.size >= 12) return;
      const side = effect.minor ? 12 : 16;
      const coin = this.add.image(effect.x, effect.y, "painted:coin-hud-pixels").setDisplaySize(side, side).setDepth(LAYER.bars + 1);
      const amount = this.add.text(effect.x + 8, effect.y, `+${effect.value}`, { fontFamily: "DNFBitBitv2", fontSize: "12px",
        color: color(PALETTE.gold), stroke: color(PALETTE.dark), strokeThickness: 2 }).setDepth(LAYER.bars + 2);
      coin.setData({ born: now, minor: effect.minor, amount: effect.value, label: amount });
      this.emphasis.fixed(coin);
      this.emphasis.fixed(amount);
      this.coins.add(coin);
      coin.once("destroy", () => { this.tweens.killTweensOf(coin); this.coins.delete(coin); amount.destroy(); });
      this.tweens.add({ targets: coin, y: effect.y - 10, duration: 100, ease: "Quad.Out",
        onUpdate: () => amount.setPosition(coin.x + 8, coin.y) });
      this.tweens.add({ targets: coin, x: 14, y: 24, delay: 100, duration: 300, ease: "Quad.In",
        onUpdate: () => amount.setPosition(coin.x + 8, coin.y), onComplete: () => {
        const arrival = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
        coin.destroy(); this.goldUntil = arrival.flash ? this.time.now + 800 : 0;
        if (this.goldLabel && arrival.motion) {
          this.tweens.killTweensOf(this.goldLabel);
          this.goldLabel.setScale(1);
          this.tweens.add({ targets: this.goldLabel, scale: 1.12, duration: 75, yoyo: true });
        }
        playSfx("coin");
      } });
    } else if (effect.kind === "upgrade") {
      const forge = buildings().forge;
      for (const [dx, dy] of [[4, -18], [10, -14], [-1, -15]]) this.once(forge.x + dx, forge.y + dy, "spark", "spark", .7, 745);
      if (this.yard) this.yard.struckAt = this.time.now;

    } else if (effect.kind === "prize") {

      this.once(CENTER.x, CENTER.y - 20, "command", "command-flash", 2, 745);
    } else if (effect.kind === "chest") {
      if (!effect.value) this.once(effect.x, effect.y - 8, "spark", "spark", 2, 745);
    } else if (effect.kind === "assault" && effect.side) {

      feedback.assaultWarnings++;
    } else if (effect.kind === "wall") {
      const tile = this.wallTiles.reduce((best, candidate) => distance(candidate, effect) < distance(best, effect) ? candidate : best, this.wallTiles[0]);
      if (tile && now - tile.struckAt > 420) { tile.struckAt = now; feedback.wallFlashes++; }
      if (this.particles.grant(1, 1)) {
        const chip = this.add.image(effect.x, effect.y, "painted:hurt-chips", "piece-0").setDisplaySize(3, 3).setDepth(LAYER.impact + 13);
        this.particles.live++; chip.once("destroy", () => this.particles.live--);
        this.tweens.add({ targets: chip, x: effect.x + Phaser.Math.Between(-10, 10), y: effect.y + Phaser.Math.Between(6, 16), alpha: 0, duration: 300, onComplete: () => chip.destroy() });
      }
    }
  }
  private tracer(from: Point, to: Point, spear = false): void {
    const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
    if (spear && (!channels.motion || !channels.flash || !this.particles.grant(1, 1)
      || this.children.list.filter(child => child.name === "spear-trail").length >= 12 || !this.decoration.acquire("sprite"))) return;
    const shot = this.add.image(from.x, from.y, "painted:shot-tracer").setDepth(LAYER.impact + 14).setRotation(Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y));
    if (spear) {
      shot.setName("spear-trail").once("destroy", () => this.decoration.release("sprite"));
      const css = this.scale.canvas.getBoundingClientRect().width / WIDTH;
      shot.setPosition(to.x, to.y).setOrigin(1, .5).setDisplaySize(24 / css, 5 / css).setAlpha(.8).setTint(0xffedba);
      this.particles.live++; shot.once("destroy", () => this.particles.live--);
      this.tweens.add({ targets: shot, alpha: 0, duration: MOTION.spearTrailMs, onComplete: () => shot.destroy() });
      return;
    }
    this.tweens.add({ targets: shot, x: to.x, y: to.y, duration: 150, onComplete: () => shot.destroy() });
  }
  private syncWalls(current: Run): void {
    if (this.builtFort !== current.fort) this.buildFort(current.fort);
    this.wallTiles.forEach((tile, index) => {
      const side = sideOf(fortRect(current.fort), tile), hp = current.walls[side], worn = 1 - hp / (current.maxWall / 4);
      const stage = Phaser.Math.Clamp(Math.floor(worn * 4.6 + (index * 7 % 3 - 1) * .3), 0, 3);
      if (stage !== tile.stage) {
        if (stage > tile.stage) this.crumble(tile, 3 + stage * 2);
        tile.stage = stage; tile.image.setTexture(`wall-${tile.shape}-${"abcd"[stage]}`);
      }
      const breached = hp <= 0;
      if (breached && tile.image.visible) {
        tile.image.setVisible(false); this.crumble(tile, 10); this.once(tile.x, tile.y, "boom", "boom", 1.4, tile.y + 4); feedback.breaches++;
      } else if (!breached && !tile.image.visible) tile.image.setVisible(true);
      if (breached) this.painted.draw(this.marks, "broken-wall-patch", tile.x - 16, tile.y - 12, { width: 32, height: 22 });
      tile.image.setTint(hp < current.maxWall / 12 ? PALETTE.warning : hp < current.maxWall / 6 ? PALETTE.warning : PALETTE.silver);
      const heat = 1 - (this.time.now - tile.struckAt) / 130;
      if (heat > 0) this.painted.draw(this.bars, "wall-hit-flash", tile.x - TILE / 2, tile.y - TILE,
        { width: TILE, height: TILE * 1.5, alpha: .38 * heat, insets: { left: 7, right: 7, top: 7, bottom: 7 } });
    });
    for (const weapon of this.wallWeapons) weapon.sprite.setVisible(current[weapon.kind] > 0 && cornerOpen(current, weapon.slot)).setFrame(Math.floor(current.time * 3) % 2);
    this.syncKeep(current); this.syncYard();
    const fort = fortRect(current.fort), share = Math.max(0, current.base / current.maxBase), top = buildings().base.y + 5;
    if (!attract) this.gauge("hp-base", CENTER.x - 23, top - 7, 46, share,
      share < .3 ? "fill-critical" : share < .6 ? "fill-warning" : "fill-high");
    if (share < .3) this.painted.draw(this.bars, "base-danger-overlay", fort.left, fort.top,
      { width: fort.right - fort.left, height: fort.bottom - fort.top, alpha: .12 + .14 * (.5 + .5 * Math.sin(this.time.now / 110)),
        insets: { left: 8, right: 8, top: 8, bottom: 8 } });
    const purse = { x: 14, y: 24 };
    const label = this.goldLabel ??= this.add.text(purse.x + 16, purse.y, "", { fontFamily: "DNFBitBitv2", fontSize: "18px", color: color(PALETTE.gold), stroke: color(PALETTE.dark), strokeThickness: 3 }).setOrigin(0, .5).setDepth(LAYER.impact + 71);
    this.emphasis.fixed(label); this.goldHud.clear();
    this.goldShown += Math.sign(current.gold - this.goldShown) * Math.min(Math.abs(current.gold - this.goldShown), Math.max(1, Math.ceil(Math.abs(current.gold - this.goldShown) / 4)));
    label.setText(String(this.goldShown)).setPosition(purse.x + 16, purse.y).setVisible(!attract);
    if (!attract) this.painted.draw(this.goldHud, "coin-hud-pixels", purse.x - 12, purse.y - 12);
    if (this.time.now < this.goldUntil - 650) this.painted.draw(this.goldHud, "coin-hud-highlight", 5, 12,
      { width: 52, height: 24, alpha: .2, source: { x: 1, y: 7, width: 30, height: 19 },
        insets: { left: 7, right: 7, top: 6, bottom: 6 } });
    this.wallShield.sync(current, calm || saved.motionOff || saved.flashesOff);
  }
  private crumble(tile: WallTile, pieces: number): void {
    feedback.wallCrumbles++; feedback.debris += pieces;
    this.once(tile.x, tile.y - 6, "smoke", "puff", 1.2, tile.y + 6);
    for (let i = 0, count = this.particles.grant(pieces, 1); i < count; i++) {
      const chip = this.add.image(tile.x + Phaser.Math.Between(-12, 12), tile.y - Phaser.Math.Between(4, 18), "painted:wall-debris", `piece-${i % 3}`).setDisplaySize(Phaser.Math.Between(2, 5), Phaser.Math.Between(2, 4)).setDepth(LAYER.impact);
      this.particles.live++; chip.once("destroy", () => this.particles.live--);
      this.tweens.add({ targets: chip, x: chip.x + Phaser.Math.Between(-18, 18), y: tile.y + Phaser.Math.Between(6, 20), angle: Phaser.Math.Between(-180, 180), alpha: 0, duration: 520, ease: "Quad.easeIn", onComplete: () => chip.destroy() });
    }
  }
  /** Keep damage stages: 1 cracks, 2 fire, 3 heavy smoke, 4 collapse. */
  /** The yard is alive: the smithy fire flickers and smokes, flaring for a moment when an upgrade is bought, and the hall's flag stirs. A device set to reduce motion gets it still. */
  private syncYard(): void {
    const yard = this.yard, now = this.time.now;
    if (!yard) return;
    const open = run?.meta.caps?.drill !== 0;
    yard.forge.setAlpha(open ? 1 : .3);
    if (!open || calm) return;
    const fire = `yard-forge${now - yard.struckAt < 400 || Math.floor(now / 170) % 2 ? 1 : 0}`, cloth = `yard-flag${Math.floor(now / 380) % 2}`;
    if (yard.forge.texture.key !== fire) yard.forge.setTexture(fire);
    if (yard.flag.texture.key !== cloth) yard.flag.setTexture(cloth);
    if (now < yard.smokeAt) return;
    yard.smokeAt = now + 1800;
    this.once(yard.forge.x - 8, yard.forge.y - 38, "smoke", "puff", .7, yard.forge.y + 40)?.setAlpha(.6);
  }
  /** A general joining or coming back runs out of the hall: from its door, small at first as he clears it, to the gate, then on to where he stands. */
  private usher(sprite: Phaser.GameObjects.Sprite, share: number, current: Run): void {
    const lift = 16 * (GENERAL_SCALE - 1), door = buildings().infirmary, turn = .6, grown = share < .3 ? .5 : 1;
    const from = share < turn ? { x: door.x, y: door.y - lift } : { x: CENTER.x, y: fortRect(current.fort).bottom - 8 - lift };
    const to = share < turn ? { x: CENTER.x, y: fortRect(current.fort).bottom - 8 - lift } : { x: sprite.x, y: sprite.y };
    const along = share < turn ? share / turn : (share - turn) / (1 - turn), y = from.y + (to.y - from.y) * along;
    sprite.setPosition(from.x + (to.x - from.x) * along, y + lift * (1 - grown)).setScale(sprite.scaleX * grown).setFlipX(to.x < from.x).setAngle(0)
      .setAlpha(Math.min(1, .4 + share * 4)).setDepth(bodyDepth(y + lift));
  }
  private syncKeep(current: Run): void {
    const keep = this.keep;
    if (!keep) return;
    const stage = keepStage(current), at = buildings().base;
    feedback.keepStage = stage;
    if (stage > keep.stage) {
      this.once(at.x, at.y - 14, "smoke", "puff", 2, at.y + 6);
      if (stage === 4) {
        feedback.keepCollapses++;
        this.once(at.x, at.y - 18, "blast", "explosion", 2.4, at.y + 8);
        this.shake(.012);
        this.tweens.add({ targets: keep.tent, scaleY: .45, angle: 8, duration: 420, ease: "Bounce.easeOut" });
        keep.tent.setTint(PALETTE.outline);
        for (let i = 0, count = this.particles.grant(14, 1); i < count; i++) {
          const chip = this.add.image(at.x, at.y - 20, "painted:keep-debris", `piece-${i % 3}`).setDisplaySize(Phaser.Math.Between(3, 6), Phaser.Math.Between(3, 5)).setDepth(at.y + 6);
          this.particles.live++; chip.once("destroy", () => this.particles.live--);
          this.tweens.add({ targets: chip, x: at.x + Phaser.Math.Between(-40, 40), y: at.y + Phaser.Math.Between(-4, 16), angle: Phaser.Math.Between(-200, 200), duration: 640, ease: "Quad.easeOut",
            onComplete: () => chip.setDepth(6) });
          this.fortParts.push(chip);
        }
      } else this.shake(.006);
    } else if (stage < keep.stage) keep.tent.setScale(1.5).setAngle(0);
    if (stage < 4) keep.tent.setTint([PALETTE.silver, PALETTE.ally, PALETTE.heal, PALETTE.outline][stage]);
    keep.stage = stage;
    keep.flames.forEach((flame, i) => flame.setVisible(stage >= 2 && i < (stage >= 3 ? 3 : 2)));
    if (stage >= 1 && stage < 4) this.painted.draw(this.bars, `keep-cracks-stage-${stage}`, at.x - 18, at.y - 34,
      { width: 36, height: 34 });
    if (stage >= 3 && this.time.now >= keep.smokeAt) {
      keep.smokeAt = this.time.now + (stage >= 4 ? 260 : 420);
      const puff = this.once(at.x + Phaser.Math.Between(-14, 14), at.y - 30, "smoke", "puff", 1.6, at.y + 7);
      if (puff) this.tweens.add({ targets: puff, y: puff.y - 34, alpha: .2, duration: 900 });
      feedback.smoke++;
    }
  }
  private syncFoes(current: Run): void {
    const alive = new Set(current.enemies.map(e => e.id)), now = this.time.now;
    const cssPixel = WIDTH / this.game.canvas.getBoundingClientRect().width;
    for (const [id, sprite] of this.foes) if (!alive.has(id)) {
      if (this.skillStage?.holds(id)) {
        // A foe a staged skill has already felled stands until its picture lands, then flashes like any struck body before it falls.
        const white = `${sprite.getData("base")}-white`;
        if (now < Number(sprite.getData("flashUntil") ?? 0) && feedbackChannels(saved.motionOff, saved.flashesOff, calm).flash
          && !sprite.getData("fullBoss") && sprite.texture.key !== white) { sprite.anims.pause(); sprite.setTexture(white, sprite.frame.name); }
        continue;
      }
      if (sprite.getData("boss")) this.emphasis.death();
      sprite.anims.stop();
      const art = { base: String(sprite.getData("base")), full: Boolean(sprite.getData("fullBoss")), ship: Boolean(sprite.getData("ship")) };
      const heading = sprite.getData("direction"), direction = heading === "front" ? "front" : heading === "back" ? "back" : "side";
      const animation = enemyAnimation(art, { moving: false, attacking: false, hurt: false, flashing: false, direction, dead: true });
      sprite.clearTint().play(animation.key);
      const duration = animation.frames.length / animation.frameRate * 1000;
      if (!art.full && !art.ship) this.tweens.add({ targets: sprite, angle: sprite.flipX ? -90 : 90, y: sprite.y + 6, duration });
      this.tweens.add({ targets: sprite, alpha: 0, delay: duration, duration: 160, onComplete: () => sprite.destroy() });
      this.foes.delete(id); this.strides.delete(id); feedback.topples++;
    }
    for (const enemy of current.enemies) {
      const art = enemyArt(enemy), { base, full } = art, big = enemy.boss || enemy.elite;
      const { x, y } = this.skillStage?.pinned(enemy.id) ?? this.positions.get(enemy) ?? enemy;
      let sprite = this.foes.get(enemy.id);
      if (!sprite) {
        sprite = this.add.sprite(enemy.x, enemy.y, full ? `boss-sheet-${base}` : base, full ? GENERAL_SHEET_COLUMNS * 2 + 14 : 0);
        sprite.setData("boss", enemy.boss).setData("fullBoss", full).setData("bossArt", enemy.bossArt).setData("base", base).setData("ship", Boolean(art.ship)); this.foes.set(enemy.id, sprite);
      }
      const size = bodyScale(false, enemy.kind === "ukita", big);
      sprite.setScale(bodyScale(full, enemy.kind === "ukita", big));
      if (enemy.enraged) sprite.setTint(PALETTE.warning); else sprite.clearTint();
      const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
      const flashing = channels.flash && (now < Number(sprite.getData("flashUntil") ?? 0) || (enemy.casting > 0 && Math.floor(now / 90) % 2 === 0));
      const texture = flashing ? `${base}-white` : base;
      if (!full && sprite.texture.key !== texture) sprite.setTexture(texture, sprite.frame.name);
      const windAt = Number(sprite.getData("windAt") ?? -1e9), windFor = Number(sprite.getData("windFor") ?? 1), wind = now - windAt;
      const tap = Math.max(0, 1 - Math.abs(now - Number(sprite.getData("lungeAt") ?? -1e9) - 70) / 70) * 5;
      const aim = wind < windFor + 160 ? Math.atan2(Number(sprite.getData("aimY")) - enemy.y, Number(sprite.getData("aimX")) - enemy.x)
        : Math.atan2(CENTER.y - enemy.y, CENTER.x - enemy.x);
      const striking = wind >= windFor && wind < windFor + 160;
      const offset = (wind >= 0 && wind < windFor ? -5 * wind / windFor : striking ? 9 * (1 - (wind - windFor) / 160) : tap) * size;
      // Keep movement across render-only frames between the fixed simulation ticks.
      let walk = this.strides.get(enemy.id);
      if (!walk) { walk = enemyMotion(enemy, current.time); this.strides.set(enemy.id, walk); }
      sampleEnemyMotion(walk, enemy, current.time);
      const { moving, direction } = walk, stride = MOTION.stride * size * (enemy.kind === "cavalry" ? 1.5 : 1);
      const step = stepsWalked(walk.gait, stride);
      if (step !== walk.step) { if (walk.step >= 0) feedback.foeSteps++; walk.step = step; }
      const hurt = now - Number(sprite.getData("struckAt") ?? -1e9);
      const cast = current.telegraphs.find(mark => mark.id === enemy.casting);
      const previousCast = Number(sprite.getData("casting") ?? 0);
      const previousStrike = Number(sprite.getData("strikeAt") ?? 0);
      if ((previousCast && !enemy.casting || previousStrike && !enemy.strikeAt) && enemy.stun <= 0)
        sprite.setData("lungeAt", now);
      sprite.setData("casting", enemy.casting).setData("strikeAt", enemy.strikeAt);
      const released = now - Number(sprite.getData("lungeAt") ?? -1e9);
      const windup = enemy.strikeAt > 0 || Boolean(cast);
      const attacking = windup || released >= 0 && released < MOTION.lungeMs;
      const preySquad = enemy.prey ? current.squads[enemy.prey[0]] : undefined;
      const prey = enemy.prey ? enemy.prey[1] < 0 ? preySquad : preySquad?.soldiers[enemy.prey[1]] : undefined;
      const target = prey ? this.positions.get(prey) ?? prey : cast ?? {
        x: Number(sprite.getData("aimX") ?? CENTER.x), y: Number(sprite.getData("aimY") ?? CENTER.y),
      };
      const facing = attackFacing({ x, y }, target);
      if (attacking) { walk.faceLeft = facing.flipX; walk.direction = facing.direction; }
      const poseDirection = attacking ? facing.direction : direction;
      const animation = enemyAnimation(art, { moving, attacking, hurt: hurt < 150, direction: poseDirection, flashing });
      const samePose = sprite.anims.currentAnim?.key.replace("-white-", "-") === animation.key.replace("-white-", "-");
      sprite.anims.resume();
      if (sprite.anims.currentAnim?.key !== animation.key)
        sprite.play({ key: animation.key, startFrame: samePose ? (sprite.anims.currentFrame?.index ?? 1) - 1 : 0 });
      sprite.setData("direction", poseDirection);
      if (attacking && hurt >= 150) {
        const frame = allyAttackFrame(animation, {
          windupProgress: cast ? (current.time - cast.startedAt) / (cast.at - cast.startedAt)
            : windup ? Math.max(0, wind / windFor) : -1,
          sinceReleaseMs: windup ? -1 : released,
        });
        sprite.anims.pause();
        sprite.setTexture(frame.key, frame.frame);
      }
      const critical = Boolean(sprite.getData("criticalHit"));
      const held = channels.motion && critical && hurt >= 0 && hurt < 33;
      const recoil = channels.motion ? hitRecoil(held ? 0 : hurt, critical) * cssPixel : 0, recoilAngle = Number(sprite.getData("recoilAngle") ?? 0);
      const drop = calm ? 0 : Math.max(0, 1 - (now - (this.bossEntries.get(enemy.id) ?? -1e9)) / 430) ** 2 * 90;
      sprite.setPosition(x + Math.cos(aim) * offset + Math.cos(recoilAngle) * recoil, y + Math.sin(aim) * offset + Math.sin(recoilAngle) * recoil - (moving ? stepHop(walk.gait, stride) * size : 0) - drop)
        .setAngle(striking ? (enemy.x > CENTER.x ? -10 : 10) : moving ? Math.sin(walk.gait / stride * Math.PI) * MOTION.lean : 0)
        .setFlipX(spriteFlipX(base, attacking ? facing.flipX : walk.faceLeft)).setDepth(bodyDepth(y));
      if (held) {
        sprite.setPosition(Number(sprite.getData("holdX")), Number(sprite.getData("holdY")));
        sprite.anims.pause();
      }
      if (enemy.shielded) this.guard(x + (sprite.flipX ? -10 : 10), y - 6);
      if (!showEnemyHealth(enemy) && !enemy.casting) continue;
      const head = spriteHealthAnchor(sprite), top = head.y;
      if (showEnemyHealth(enemy)) {
        this.health(head.x, top, enemy.hp / enemy.maxHp, "enemy");
        const resist = enemy.bossArt ? BOSSES[enemy.bossArt].resist : undefined;
        if (enemy.kind !== "ukita" && resist) this.bossMark(head.x, top, resist);
      }
      if (enemy.casting) {
        const bob = Math.sin(now / 60) * 2;
        this.painted.draw(this.bars, "boss-cast-exclamation", x - 12, top - 33 + bob);
      }
    }
    const chief = current.enemies.find(enemy => enemy.kind === "ukita");
    if (chief) {
      this.bars.fillStyle(PALETTE.dark, .85).fillRect(45, 53, 300, 8)
        .fillStyle(PALETTE.danger).fillRect(46, 54, 298 * chief.hp / chief.maxHp, 6);
    }
  }
  /** A boss wears one mark: a shield bearing the weapon it shrugs off, or a cracked shield when it has no such defence and a general's skill bites deeper. It sits over the left end of the health bar, leaving the middle to the cast warning. */
  private bossMark(x: number, top: number, name: keyof typeof BOSS_MARKS): void {
    const left = Math.round(x) - 32, up = Math.round(top) - 33;
    this.painted.draw(this.bars, BOSS_MARKS[name], left, up);
  }
  private syncShots(current: Run): void {
    const live = new Set(current.shots.map(shot => shot.id));
    for (const [id, sprite] of this.missiles) if (!live.has(id)) { sprite.destroy(); this.missiles.delete(id); }
    for (const shot of current.shots) {
      const heading = Phaser.Math.Angle.Between(shot.x, shot.y, shot.toX, shot.toY);
      if (shot.kind === "bullet") {
        this.bars.save().translateCanvas(Math.round(shot.x), Math.round(shot.y)).rotateCanvas(heading);
        this.painted.draw(this.bars, "bullet", -19, -12);
        this.bars.restore();
        continue;
      }
      const art = shotArt(shot.kind, heading, shot.flaming);
      let sprite = this.missiles.get(shot.id);
      if (!sprite) {
        sprite = this.add.sprite(shot.x, shot.y, art.key, art.frame).setDepth(LAYER.impact + 15);
        if (shot.kind === "rocket") sprite.play("rocket-flight");
        this.missiles.set(shot.id, sprite); feedback.projectiles++;
        if (shot.flaming) feedback.flamingArrows++;
      }
      const scale = 1 + .28 * ((shot.tier ?? 1) - 1);
      sprite.setPosition(shot.x, shot.y).setRotation(art.rotation).setScale(scale).setTint(art.tint);
      if (shot.kind === "arrow") sprite.setFrame(art.frame);
      feedback.maxProjectileScale = Math.max(feedback.maxProjectileScale, scale);
      if (shot.flaming) {
        const tail = 9 * scale;
        this.bars.save().translateCanvas(Math.round(shot.x - Math.cos(heading) * tail), Math.round(shot.y - Math.sin(heading) * tail)).rotateCanvas(heading);
        this.painted.draw(this.bars, "flaming-arrow-tail", -21 * scale, -12 * scale, { width: Math.round(24 * scale), height: Math.round(24 * scale) });
        this.bars.restore();
      }
      if (shot.kind === "rocket") {
        for (const [part, spread] of [-4, 4].entries()) {
          const x = shot.x - Math.sin(heading) * spread, y = shot.y + Math.cos(heading) * spread;
          this.bars.save().translateCanvas(Math.round(x), Math.round(y)).rotateCanvas(heading);
          this.painted.draw(this.bars, "rocket-tails", -21, part === 0 ? -6 : -5,
            { source: { x: 0, y: part * 12, width: 24, height: 12 }, width: 24, height: 12 });
          this.bars.restore();
        }
      }
    }
  }
  private muster(squad: Squad, signature: string): Troop {
    return { signature, leader: this.recruitTrooper(generalUnit(squad.general), squad), troopers: squad.soldiers.map(unit => this.recruitTrooper(unit.kind, unit)) };
  }
  private recruitTrooper(key: string, unit: Unit): Trooper {
    const art = bphUnitArt(unit, key);
    return { unitId: unit.id, sprite: this.add.sprite(unit.x, unit.y, art, 0), key: art, windFor: 1, strikeAt: -1e9, hurtAt: -1e9, fellAt: -1e9, downAt: -1e9,
      aimX: unit.x, aimY: unit.y, motion: enemyMotion(unit, -1), faceLeft: unit.x > CENTER.x };
  }
  /** A recruit starts in the tent's doorway and shows fully once he has stepped out of it. */
  private emerged(unit: Unit): number {
    if (!unit.emerging) return 1;
    const door = buildings().barracks, inside = door.y - unit.y;
    return Math.abs(unit.x - door.x) > 8 || inside <= 0 || inside > 20 ? 1 : Phaser.Math.Clamp((20 - inside) / 14, .15, 1);
  }
  /** Attack contact frames follow actual shot/swing events; supplied character poses take precedence over bob-only miniatures. */
  private pose(trooper: Trooper, unit: Unit, current: Run, out: boolean, motionTime = current.time): void {
    const now = this.time.now, blow = now - trooper.strikeAt, hurt = now - trooper.hurtAt;
    const spear = unit.kind === "spearman", duration = spear ? MOTION.spearContactMs + MOTION.spearRecoveryMs : MOTION.lungeMs;
    const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
    const actingNow = !out && (unit.strikeAt > 0 || !spear && blow >= 0 && blow < MOTION.lungeMs);
    const target = current.enemies.find(enemy => enemy.id === (unit.quarry ?? unit.aim));
    const targetAt = target ? this.positions.get(target) ?? target : { x: trooper.aimX, y: trooper.aimY };
    const facing = attackFacing(this.positions.get(unit) ?? unit, targetAt);
    if (actingNow) {
      trooper.aimX = targetAt.x; trooper.aimY = targetAt.y;
    }
    sampleEnemyMotion(trooper.motion, unit, motionTime);
    if (!out && (unit.strikeAt > 0 || blow >= 0 && blow < duration)) { trooper.faceLeft = trooper.motion.faceLeft = facing.flipX; trooper.motion.direction = facing.direction; }
    else if (!out && trooper.motion.moving) trooper.faceLeft = trooper.motion.faceLeft;
    if (unit.kind === "panokseon") {
      const boats = current.squads.flatMap(squad => squad.soldiers).filter(boat => boat.kind === "panokseon");
      const base = current.drill.panokseon === 2 && boats[0] === unit ? "geobukseon" : "panokseon";
      if (out && trooper.downAt < 0) trooper.downAt = now;
      if (!out) trooper.downAt = -1e9;
      const [start, count] = out ? SHIP_POSES.death : hurt < 300 ? SHIP_POSES.hit
        : unit.strikeAt > 0 || blow >= 0 && blow < MOTION.lungeMs ? SHIP_POSES.attack : SHIP_POSES.idle;
      const acting = !out && (unit.strikeAt > 0 || blow >= 0 && blow < MOTION.lungeMs);
      const attack = acting && hurt >= 300 ? allyAttackFrame(enemyAnimation({ base, full: false, ship: true },
        { moving: false, attacking: true, hurt: false, direction: facing.direction, flashing: false }),
        { windupProgress: unit.strikeAt > 0 ? 1 - (unit.strikeAt - current.time) / (trooper.windFor / 1000) : -1,
          sinceReleaseMs: unit.strikeAt > 0 ? -1 : blow }) : undefined;
      const frame = out ? Math.min(count - 1, Math.floor((now - trooper.downAt) / 125))
        : hurt < 300 ? Math.min(count - 1, Math.floor(hurt / 100)) : Math.floor(current.time * 8) % count;
      trooper.sprite.setTexture(base, attack?.frame ?? 28 + start + Math.max(0, frame))
        .setPosition(unit.x, unit.y).setDepth(bodyDepth(unit.y)).setScale(1).setAlpha(out ? 0 : 1).setAngle(0).setFlipX(acting ? facing.flipX : trooper.faceLeft);
      return;
    }
    const at = this.positions.get(unit) ?? unit;
    const leader = unit.kind === "general", size = leader ? GENERAL_SCALE : 1, lift = leader ? 16 * (GENERAL_SCALE - 1) : unit.perch !== undefined ? WALL_LIFT : WALL_LIFT * Math.max(0, 1 - (now - trooper.fellAt) / 260) ** 2, stride = MOTION.stride * size;
    const moving = !out && trooper.motion.moving, step = stepsWalked(trooper.motion.gait, stride);
    if (step !== trooper.motion.step) { trooper.motion.step = step; feedback.steps++; }
    const striking = !out && blow >= 0 && blow < duration, acting = unit.strikeAt > 0 || striking;
    const phase = { windupProgress: unit.strikeAt > 0 ? 1 - (unit.strikeAt - current.time) / (trooper.windFor / 1000) : -1,
      sinceReleaseMs: striking ? blow : -1, windupMs: trooper.windFor,
      contactMs: spear ? MOTION.spearContactMs : 0, recoveryMs: spear ? MOTION.spearRecoveryMs : MOTION.lungeMs };
    const css = this.scale.canvas.getBoundingClientRect().width / WIDTH;
    const offset = friendlyStrikeOffset(unit.kind, phase);
    const push = out || !channels.motion ? 0 : spear && offset < 0 ? offset * 3 / FRIENDLY_ATTACK.spearman.pull / css : offset * size;
    const aim = Math.atan2(trooper.aimY - unit.y, trooper.aimX - unit.x);
    if (spear && striking && trooper.sprite.getData("trailAt") !== trooper.strikeAt) {
      trooper.sprite.setData("trailAt", trooper.strikeAt);
      this.tracer({ x: at.x, y: at.y - lift }, { x: at.x + Math.cos(aim) * push, y: at.y - lift + Math.sin(aim) * push }, true);
    }
    if (push !== 0) feedback.strikePoses++;
    trooper.key = bphUnitArt(unit, trooper.key);
    const art = allyArt(trooper.key), animation = allyAnimation(trooper.key, { moving, attacking: acting, hurt: hurt < 110, down: out, direction: acting ? facing.direction : trooper.motion.direction });
    if (trooper.sprite.anims.currentAnim?.key !== animation.key) {
      if (out) trooper.downAt = now;
      trooper.sprite.play(animation.key);
    } else if (!out) trooper.sprite.play(animation.key, true);
    if (acting && !out && hurt >= 110) {
      const frame = allyAttackFrame(animation, phase);
      trooper.sprite.anims.pause();
      trooper.sprite.setTexture(frame.key, frame.frame);
    }
    const fall = out ? Math.min(1, (now - trooper.downAt) / 250) : 0;
    const jolt = out || hurt >= 110 || !channels.motion ? 0 : Math.floor(hurt / 28) % 2 ? 2 : -2, hop = moving && channels.motion ? stepHop(trooper.motion.gait, stride) * size : 0;
    const lean = !channels.motion ? 0 : out ? art.full ? 0 : 90 * fall : striking ? (trooper.faceLeft ? -1 : 1) * FRIENDLY_ATTACK[unit.kind].swing * (1 - blow / duration) : moving ? Math.sin(trooper.motion.gait / stride * Math.PI) * MOTION.lean : 0;
    const squash = spear && striking && channels.motion && !art.full ? .08 * (blow < 50 ? 1 : Math.max(0, 1 - (blow - 50) / 100)) : 0;
    trooper.sprite.setScale(size * (art.full ? .5 : 1) * (1 + squash), size * (art.full ? .5 : 1) * (1 - squash)).setPosition(at.x + Math.cos(aim) * push + jolt, at.y - lift + Math.sin(aim) * push - hop + (out ? 6 : 0))
      .setFlipX(spriteFlipX(trooper.key, trooper.faceLeft)).setAngle(lean).setAlpha((1 - fall * .65) * (leader ? 1 : this.emerged(unit))).setDepth(bodyDepth(unit.perch !== undefined ? fortRect(current.fort).bottom + TILE : at.y));
  }
  private gauge(slug: "hp-base" | "hp-chief" | "hp-general-boss" | "revive-progress" | "hp-soldier",
    left: number, top: number, width: number, share: number, fill = "fill"): void {
    const innerWidth = width - 14, amount = Math.round(innerWidth * Phaser.Math.Clamp(share, 0, 1));
    const frameKey = `gauge:${slug}:${width}`, fillKey = `gauge:${slug}:${fill}:${width}`;
    if (!this.textures.exists(frameKey)) {
      const picture = this.add.graphics();
      this.painted.draw(picture, `${slug}-frame`, 0, 0, { width, height: 19,
        source: { x: 1, y: 6, width: 30, height: 19 }, insets: { left: 7, right: 7, top: 7, bottom: 6 },
        alpha: slug === "hp-base" ? .9 : slug === "hp-chief" ? .85 : 1 });
      picture.generateTexture(frameKey, width, 19); picture.destroy();
    }
    if (!this.textures.exists(fillKey)) {
      const picture = this.add.graphics();
      this.painted.draw(picture, `${slug}-${fill}`, 0, 0, { width: innerWidth, height: 6,
        source: { x: 8, y: 13, width: 16, height: 6 }, insets: { left: 0, right: 0, top: 0, bottom: 0 } });
      picture.generateTexture(fillKey, innerWidth, 6); picture.destroy();
    }
    let images = this.gaugeImages[this.gaugeCount++];
    if (!images) {
      images = {
        frame: this.add.image(0, 0, frameKey).setOrigin(0).setDepth(LAYER.bars),
        fill: this.add.image(0, 0, fillKey).setOrigin(0).setDepth(LAYER.bars),
      };
      this.gaugeImages.push(images);
    }
    images.frame.setTexture(frameKey).setPosition(Math.round(left), Math.round(top - 4)).setVisible(true);
    images.fill.setTexture(fillKey).setCrop(0, 0, amount, 6).setPosition(Math.round(left + 7), Math.round(top + 3)).setVisible(amount > 0);
  }
  private health(x: number, y: number, share: number, kind: "ally" | "enemy" | "revive"): void {
    const box = reserveHealthBar({ x: Math.round(x) - 20, y: Math.round(y), width: 40, height: 5 }, this.healthBoxes);
    this.bars.fillStyle(PALETTE.outline).fillRect(box.x, box.y, 40, 5)
      .fillStyle(PALETTE.dark).fillRect(box.x + 1, box.y + 1, 38, 3)
      .fillStyle(kind === "enemy" ? PALETTE.danger : kind === "ally" ? PALETTE.ally : PALETTE.gold)
      .fillRect(box.x + 1, box.y + 1, Math.round(38 * Math.max(0, share)), 3);
  }
  private guard(x: number, y: number): void {
    this.painted.draw(this.bars, "guard-sprite", Math.round(x) - 16, Math.round(y) - 16);
  }
  private syncTroops(current: Run): void {
    current.squads.forEach((squad, id) => {
      const troop = this.troops[id], at = this.positions.get(squad) ?? squad;
      const down = squad.state === "down";
      const since = this.time.now - (this.entered.get(id) ?? -1e9), entering = !down && since < ENTRANCE_MS;
      this.pose(troop.leader, squad, current, down);
      if (entering) this.usher(troop.leader.sprite, since / ENTRANCE_MS, current);
      if (down) {
        const left = Math.max(0, squad.downUntil - current.time), tent = buildings().infirmary;
        troop.leader.sprite.setAlpha(Math.min(.85, distance(squad, tent) / 30)).setVisible(distance(squad, tent) > 8);
        this.health(tent.x, tent.y + 4 + id * 12, 1 - left / BALANCE.downSeconds, "revive");
      } else {
        troop.leader.sprite.setVisible(true);
        if (current.time < squad.safeUntil) troop.leader.sprite.setAlpha(Math.floor(this.time.now / 100) % 2 ? .45 : 1);
        const head = spriteHealthAnchor(troop.leader.sprite);
        if (!entering && squad.hp < squad.maxHp) this.health(head.x, head.y, squad.hp / squad.maxHp, "ally");
        if (!entering) drawAttackPreparation(this.bars, troop.leader.sprite, this.healthBoxes, squad.strikeAt, current.time, troop.leader.windFor, true);
      }
      squad.soldiers.forEach((unit, index) => {
        const trooper = troop.troopers[index];
        this.pose(trooper, unit, current, !fit(unit, current.time));
        if (fit(unit, current.time) && unit.hp < unit.maxHp) {
          const { x, y: top } = spriteHealthAnchor(trooper.sprite);
          const box = reserveHealthBar({ x: Math.round(x) - 11, y: Math.round(top), width: 22, height: 4 }, this.healthBoxes);
          this.bars.fillStyle(PALETTE.outline).fillRect(box.x, box.y, 22, 4)
            .fillStyle(PALETTE.dark).fillRect(box.x + 1, box.y + 1, 20, 2)
            .fillStyle(PALETTE.ally).fillRect(box.x + 1, box.y + 1, Math.round(20 * unit.hp / unit.maxHp), 2);
        }
        if (fit(unit, current.time)) drawAttackPreparation(this.bars, trooper.sprite, this.healthBoxes, unit.strikeAt, current.time, trooper.windFor, false);
      });
      if (squad.state === "charge" && this.time.now - this.lastStreak > 150) {
        this.lastStreak = this.time.now;
        if (squad.lane) this.once(squad.x, squad.y, "charge", "rush", 2, 750)?.setRotation(Phaser.Math.Angle.Between(squad.x, squad.y, squad.lane.toX, squad.lane.toY));
      }
    });
  }
  private syncField(current: Run): void {
    const now = this.time.now, pulse = .5 + .5 * Math.sin(now / 90);
    // Safety ranges stay above combat effects, below health bars, outside the decoration budget.
    for (const mark of current.telegraphs) {
      const progress = Phaser.Math.Clamp((current.time - mark.startedAt) / (mark.at - mark.startedAt), 0, 1);
      const from = mark.shape === "lane" ? { x: mark.fromX, y: mark.fromY } : undefined;
      this.danger.fillStyle(PALETTE.danger, feedbackChannels(saved.motionOff, saved.flashesOff, calm).motion ? .35 + .35 * progress : .525);
      for (const cell of rangeCells(mark.x, mark.y, mark.radius, from)) this.danger.fillRect(cell.x, cell.y, 4, 4);
    }
    if (this.frames % 6 === 0) aims = current.squads.map(squad => fielded(squad) && squad.skillClock <= 0 ? skillAim(current, squad.id) : null);
    if (current.wall < current.maxWall * .3) this.painted.draw(this.alarm, "wall-critical-frame", 0, 0,
      { width: WIDTH, height: HEIGHT, alpha: .2 + .25 * pulse, insets: { left: 8, right: 8, top: 8, bottom: 8 } });
    if (current.weather === "비") {
      for (let i = 0; i < 30; i++) {
        const x = Math.round((i * 71 + current.time * 42) % WIDTH), y = Math.round((i * 43 + current.time * 210) % HEIGHT);
        this.painted.draw(this.rain, "rain", x - 12, y - 12, { alpha: .35 });
      }
    }
  }
  update(_time: number, delta: number): void {
    if (!run) return;
    if (this.serial !== runSerial) {
      this.uniqueSkillView?.clear();
      this.reset();
      if (firstBattleGuideOpen) {
        this.goldShown = run.gold;
        this.syncWalls(run);
        this.troops = run.squads.map(squad => this.muster(squad, ""));
        this.syncTroops(run);
      }
    }
    if (paused) { this.tweens.timeScale = this.anims.globalTimeScale = 0; return; }
    const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
    const cssPixel = WIDTH / this.game.canvas.getBoundingClientRect().width;
    const held = this.impactBudget.holding(this.time.now, !channels.motion);
    this.tweens.timeScale = 1; this.anims.globalTimeScale = held ? 0 : 1;
    if (!attract && this.time.now >= this.hitStopUntil) {
      this.accumulator += Math.min(delta / 1000, .1);
      while (this.accumulator >= 1 / 30) { effects.push(...advance(run, 1 / 30)); this.accumulator -= 1 / 30; }
    }
    if (!attract) keepCodexChanges();
    this.particles.sample(delta); this.density = storm(run.time) * this.particles.headroom();
    this.river.setPosition(WIDTH / 2, riverBank()).setSize(WIDTH, HEIGHT - riverBank()).setOrigin(.5, 0);
    this.bank.setPosition(WIDTH / 2, riverBank() - 12).setSize(WIDTH, 32).setOrigin(.5, 0);
    this.river.tilePositionX = run.time * 4;
    element("arena").style.setProperty("--river-flow", String(-this.river.tilePositionX));
    this.bars.clear(); this.marks.clear(); this.danger.clear(); this.alarm.clear(); this.rain.clear();
    this.healthBoxes.length = 0;
    this.gaugeCount = 0;
    for (const images of this.gaugeImages) { images.frame.setVisible(false); images.fill.setVisible(false); }
    this.syncWalls(run);
    if (attract) { this.parade(run, Math.min(delta / 1000, .1)); return; }
    this.positions = battleLayout(run, this.positions, Math.min(delta / 1000, .1));
    run.squads.forEach((squad, id) => {
      const signature = squad.general + squad.soldiers.map(unit => `${unit.kind}${unit.tier}`).join("");
      const troop = this.troops[id];
      if (!troop) this.troops[id] = this.muster(squad, signature);
      else {
        const existing = new Map(troop.troopers.map(trooper => [trooper.unitId, trooper]));
        const retained = new Set(squad.soldiers.map(unit => unit.id));
        for (const trooper of troop.troopers) if (!retained.has(trooper.unitId)) trooper.sprite.destroy();
        troop.troopers = retainRoster(squad.soldiers, existing, index => this.recruitTrooper(squad.soldiers[index].kind, squad.soldiers[index]));
        troop.signature = signature;
      }
    });
    effects = this.stage(effects, run, channels.motion, delta, cssPixel);
    this.damageNumbers.beginFrame(this.time.now);
    for (const effect of effects) if (effect.kind === "hit" && effect.value > 0 && effect.target !== undefined) {
      const target = this.foes.get(effect.target);
      const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
      feedback.sparks += emitContactParticles({ scene: this, particles: this.particles, decoration: this.decoration, channels }, effect); // J3 contact particles
      if (target) {
        const flash = hitFlash(this.time.now, Number(target.getData("flashStartedAt") ?? -1e9), Number(target.getData("flashUntil") ?? -1e9), Boolean(effect.critical));
        target.setData("flashUntil", flash.until).setData("flashStartedAt", flash.startedAt).setData("struckAt", this.time.now)
          .setData("criticalHit", Boolean(effect.critical)).setData("holdX", target.x).setData("holdY", target.y)
          .setData("recoilAngle", Math.atan2(effect.y - (effect.fromY ?? CENTER.y), effect.x - (effect.fromX ?? CENTER.x)));
        if (channels.flash) feedback.whiteFlashes++;
        if (channels.motion) feedback.knockbacks++;
      }
      if (effect.critical && this.impactBudget.critical(this.time.now, !channels.motion)) feedback.shakes++;
      const head = target ? spriteHealthAnchor(target) : { x: effect.x, y: effect.y - 14 };
      const index = this.damageNumbers.add(head.x, head.y - 8, effect.value, Boolean(effect.critical), this.time.now);
      if (index >= 0) {
        this.numberSprites[index].setFontSize((effect.critical ? 16 : 12) * cssPixel).setStroke("#17131d", 2 * cssPixel)
          .setText(String(effect.value)).setColor(effect.critical ? "#ffdf53" : "#ffffff");
        feedback.numbers++;
        if (effect.critical) feedback.criticalNumbers++;
      }
    }
    for (const effect of effects) {
      const striker = this.trooperOf(effect);
      if (striker && (effect.kind === "shot" || effect.kind === "swing")) {
        striker.strikeAt = this.time.now; striker.aimX = effect.x; striker.aimY = effect.y;
      } else if (striker && effect.kind === "hurt") {
        striker.hurtAt = this.time.now;
        const head = spriteHealthAnchor(striker.sprite);
        const index = this.damageNumbers.add(head.x, head.y - 8, effect.value, false, this.time.now);
        if (index >= 0) {
          this.numberSprites[index].setFontSize(12 * cssPixel).setStroke("#17131d", 2 * cssPixel)
            .setText(String(effect.value)).setColor("#ff6969");
          feedback.numbers++;
        }
      }
      if (striker && effect.kind === "windup") {
        striker.windFor = effect.value * 1000; striker.aimX = effect.x; striker.aimY = effect.y;
      }
      const foe = effect.target === undefined ? undefined : this.foes.get(effect.target);
      if (foe && effect.kind === "lunge")
        foe.setData("windAt", this.time.now).setData("windFor", effect.value * 1000).setData("aimX", effect.x).setData("aimY", effect.y);
      if (foe && (effect.kind === "wall" || effect.kind === "shot" && effect.hostile))
        foe.setData("lungeAt", this.time.now);
      if (!attract) cue(effect, run);

      if (!this.decoration.effect(effect, this.time.now)) continue;
      this.show(effect, run);
    }
    effects = [];
    if (!held) { this.syncFoes(run); this.syncTroops(run); this.syncShots(run); }
    this.syncField(run);
    this.uniqueSkillView?.sync(run, !channels.motion);
    const shake = this.impactBudget.sample(this.time.now, !channels.motion);
    this.cameras.main.setScroll(shake.x * cssPixel, shake.y * cssPixel);
    this.damageNumbers.slots.forEach((slot, index) => {
      const sprite = this.numberSprites[index];
      sprite.setVisible(slot.active);
      if (!slot.active) return;
      const frame = damageNumberFrame(this.time.now - slot.startedAt, slot.critical, channels.motion);
      const margin = (sprite.width / 2 + 2 * cssPixel) * frame.scale;
      sprite.setPosition(Phaser.Math.Clamp(slot.x, margin, WIDTH - margin),
        Phaser.Math.Clamp(slot.y - frame.rise * cssPixel, sprite.height * frame.scale / 2, HEIGHT - sprite.height / 2))
        .setAlpha(frame.alpha).setScale(frame.scale);
    });
    if (++this.frames % 5 === 0 || run.phase !== shownPhase || run.roulette) updateHud();
  }
}
const game = new Phaser.Game({ type: Phaser.CANVAS, parent: "arena", width: WIDTH, height: HEIGHT, backgroundColor: color(PALETTE.outline),
  pixelArt: true, antialias: false, roundPixels: true, audio: { noAudio: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [CastleScene] });
window.castleSample = { snapshot: () => run ? { ...run, enemyUnits: run.enemies, enemies: run.enemies.length, speed: 1, field: { width: WIDTH, height: HEIGHT }, feedback, paused, attract, sound: audioState() }
  : { phase: "ready", speed: 1 } };
declare global { interface Window { castleSample: { snapshot: () => Record<string, unknown> } } }
