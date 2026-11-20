import Phaser from "phaser";
import "./style.css";
import { BOSS_MARKS, chargeRing, pixelIcon, timberFrame } from "./icons";
import { cardPicture, prizePicture, SKILL_ICONS, skillIconFile, skillPicture, soldierArt, stars } from "./card-art";
import type { IconName } from "./icons";
import { YARD_PICTURES, yardPicture } from "./yard";
import { language, setLanguage, t, tr } from "./i18n";
import { relabelDom } from "./i18n-dom";
import { loadingFailed, startFailed, startProgress, startReady } from "./start-loading";
import { imagesReady, preloadAllArt } from "./art-preload";
import { sceneArt } from "./art-atlas";
import { mountWeatherHud } from "./weather-hud";
import { setupPanelMotion } from "./panel-motion";
import { showFirstBattleGuide } from "./first-battle-guide";
import "./audio/volume-controls";
import { award, bonusesOf, canBuy, getMetaBonuses, keepMeta, loadMeta, meritFor, META_NODES, META_STORE, nextUnlocks, openGenerals } from "./meta";
import { diagnosis } from "./meta-view";
import { CASTS, fewest, PRIZE_TIERS, REINFORCE, SOLDIERS, buyRecruit, recruitCost, GENERAL_CLASS, SOLDIER_NAMES } from "./rules";
import { audioState, cancelPendingSfx, playSfx as emitSfx, setBgmIntensity, setBgmScene, setMuted, startBgm, stopBgm } from "./audio";
import type { SfxName } from "./audio";
import { MOTION, stepHop, stepsWalked, FRIENDLY_ATTACK, friendlyStrikeOffset } from "./motion";
import { advance, ARMS, BALANCE, cardText, choose, chooseGeneral, generalHandOpen, hireBphGeneral, createRun, DURATION, enterEndless, fielded, fit, rouletteIndex,
  SIEGE_EVERY, skillAim, SKILL_NAMES, downSeconds, upgradeClass, upgradeCost, useSkill, growthTier, reelCards } from "./rules";
import type { Aim, CardId, Effect, EnemyKind, General, Roulette, Run, SoldierKind, Squad, Telegraph, Unit } from "./rules";
import { CENTER, distance, enemyBodyScale, FORT_TILES, fortGates, fortGroundRect, fortRect, HEIGHT, route, setFieldSize, TILE, weaponSlots, WIDTH } from "./geometry";
import type { Direction, Point, Rect } from "./geometry";
import { buildings, cornerOpen, keepStage } from "./fortification";
import { sideOf, gapToRect } from "./geometry";
import { generalReach, reachLevel, sharedLevel } from "./general-reach";
import { updateGeneralLevelBadge } from "./general-level-badge";
import type { Reach } from "./general-reach";
import { BOSSES } from "./bosses";
import { fullsetArt } from "./fullset-art";
import { ImpactBudget } from "./impact";
import { DamageNumbers, damageNumberFrame, damageNumberStyle, hitFlash, holdHit, hitRecoil, hitSquash, mergedNumberScale, playEnemyDeath, whitenHitPixels } from "./hit-feedback";
import { DAMAGE_NUMBERS_STORE, damageNumberShown, damageNumbersMode, damageNumbersOn, setDamageNumbersOn, shownAmount } from "./display-scale";
import { attackFacing, cavalryAttackTarget, spriteFlipX } from "./attack-facing";
import { emitContactParticles, ParticleCap, storm } from "./fxdensity";
import { skillButtonCast, skillReady } from "./skill-button";
import { hitVfx, skillVfx } from "./skill-vfx";
import type { SkillVfx } from "./skill-vfx";
import { ARMY_KINDS, GENERAL_ART, GENERAL_SCALE, generalPortrait, generalUnit, rosterFor } from "./roster";
import { ENEMY_ANIMATIONS, ENEMY_TEXTURES as foeTextures, FULL_ENEMY_ART, enemyAnimation, enemyArt, enemyMotion, sampleEnemyMotion } from "./enemy-animation";
import { MINIBOSS } from "./minibosses";
import type { EnemyMotion } from "./enemy-animation";
import { ALLY_ANIMATIONS, ALLY_TEXTURES, BOW_ATTACK_ART, THROW_ATTACK_ART, FULL_ALLY_ART, allyAnimation, allyArt, allyAttackFrame, isTabletHit } from "./ally-animation";
import { riverBank, SHIP_TEXTURES, SHIP_FRAME, SHIP_POSES, TRANSPORT_TIERS, transportView } from "./river";
import { battleLayout, showEnemyHealth, retainRoster, UNIT_FRAME, BOSS_FRAME } from "./sprite-layout";
import { restingHealthAnchor, spriteHealthAnchor } from "./sprite-health";
import { attackCycle, drawAttackPreparation } from "./attack-preparation";
import type { AttackCycle } from "./attack-preparation";
import { reserveHealthBar } from "./health-bars";
import type { HealthBar } from "./health-bars";
import { cardRarity } from "./cards";
import { ARROW_ART, bodyDepth, bodyScale, CHONGTONG_SHOT_ART, color, DecorationBudget, feedbackChannels, LAYER, PALETTE, paintedRange, rangeCells, shotArt, skillCharge } from "./presentation";
import { personalize, recolorPainted } from "./general-art";
import { PaintedArt } from "./painted-art";
import { PAINTED_FILES } from "./painted-files";
import { WallShield } from "./wall-shield";
import { UniqueSkillView } from "./skills-unique-view";
import { bannerWindows, castResults, holdBack, noteCast, windowMask } from "./skill-show";
import { SkillStage } from "./skill-stage";
import { SKILL_SHOWS } from "./shows";
import { tacticStrikes } from "./tactic-strike-show";
import { setBellLean } from "./shows/heal-wave-show";
import { CHAOS_SHOWS } from "./chaos-shows";
import { ambient as unitFx } from "./bph-unit-fx-view";
import { nearbyMilitia } from "./bph-fx-profiles";
import { recolorAlliedEffectPixels } from "./unit-fx-palette";
import { UNIQUE_SKILL_DESCRIPTIONS } from "./skills-unique";
import { BPH_GENERAL_CLASS, BPH_GENERALS } from "./bph-commanders";
import type { BphGeneral } from "./bph-commanders";
import { BPH_CLASS_NAMES } from "./bph-data";
import type { BphClass } from "./bph-contract";
import { checkGeneralUnlocks } from "./bph-general-unlock-view";
import { ensureBphSave, createBphRun, settleBphRun, bphBattleMedals, bphMilestones, recordEndlessBest } from "./bph-session";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { bphSurvivalFinalsRemain } from "./bph-survival";
import { mountBphCodexEntry, renderBphField, renderBphShop, toggleBphSmithy, type BphPanels } from "./bph-view";
import { renderBphRelics } from "./bph-relic-view";
import { bphWallTexture, bphWallTier } from "./bph-smithy";
import { bphCastleBuildingAt, bphCastleStanding, type BphCastleBuilding } from "./bph-castle-buildings";
import { collectBphBarracks } from "./bph-barracks";
import { bphTempleReady, collectBphTemple } from "./bph-fx-buildings";
import { endBphShopVisit, prepareBphFieldShop, prepareBphManagementShop } from "./bph-shop-session";
import { activeBphEffects, recordBphProgress, prepareBphUpgrades } from "./bph-upgrades";
import { growthFor } from "./skill-growth";
import { skillGrowthDescription, skillPips } from "./skill-growth-view";
import { takeBphRefundNotice } from "./bph-upgrade-migration";
import { showBphRefundToast } from "./bph-refund-toast";
import { closeBphRelicToast, showBphRelicToast } from "./bph-relic-toast";
import { takeBphRelicNotices } from "./bph-relics";
import { aimBphTactic, bphTacticCursor, bphTapStrike, tapBphStrike, updateBphPointer } from "./bph-fx-dispatch";
import { TapStrikeView } from "./tap-strike-view";
import { TapAim } from "./tap-strike-aim";
import { refreshBphEffects } from "./bph-fx-dispatch";
import { bphChilledEnemies, bphHeroFrenzyScale } from "./bph-tome-fields";
import { enterBphImprovements, notifyBphQuestCompletion, projectBphSalary, startBphCampaignAttempt, takeBphRelicAcquisitions } from "./bph-account";
import { bphArtFile, bphArtPath, bphUnitArt, BPH_SHIP_VARIANT_ART } from "./bph-art";
import { bphPrism, prismSheet, PRISM_PHASES, PRISM_ROWS, PRISM_STEP_MS, PRISM_STILL_ROW } from "./bph-prism";
import { BossCamera } from "./boss-camera";
import { showResultUnlocks } from "./result-screen";
import { takeBphFoilTooltip, showBphFoilTooltip } from "./bph-foil-tooltip";
import { track } from "./analytics";
import { createGameAnalytics } from "./game-analytics";
import { bphHireSlots } from "./bph-join";
import { initPlayerFeedback, notifySurveyRunEnd } from "./player-feedback";

initPlayerFeedback();

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
const levelBadgeMockup = parameters.get("lvbadge") !== "0";
/** The command building by wall tier (owner DMs 1794931170.933289, 1794931217.858059): palisade E, stone wall G, castle F. */
const CORE_ART = ["core_palisade", "core_stone", "core_castle"] as const;
/** The gates by wall tier (owner DM 1794959357 "이대로 일단 해"): palisade, fieldstone, stone. North and south share one face;
 * the east and west gates open toward the courtyard and mirror each other. */
const GATE_ART = ["gate_palisade", "gate_fieldstone", "gate_stone"] as const;
/** The wall tiles by wall tier, same approval and tiers as the gates; bph-smithy.ts bphWallTexture picks the key. */
const WALL_ART = ["wall_palisade", "wall_fieldstone", "wall"] as const;
const gateTexture = (tier: number, face: "" | "-e" | "-w") => `gate-${Math.min(tier, GATE_ART.length - 1)}${face}`;
/** Keep damage stages 0-3 as a multiply tint: unharmed shows the art's own colours, each stage a little darker. */
const CORE_DAMAGE_SHADE = [0xffffff, 0xe0e0e0, 0xc4c4c4, 0xa8a8a8] as const;
// Dev-only manual clock for inspecting real recruit and combat behavior in a headless browser.
const unitSandbox = import.meta.env.DEV && parameters.get("unitSandbox") === "1";
const publicGame = !unitSandbox && !(import.meta.env.CASTLE_SANDBOX_PREVIEW && parameters.get("sandbox") === "1")
  && !(import.meta.env.CASTLE_CODEX_PREVIEW && parameters.get("codex") === "all");
const analytics = publicGame && track ? createGameAnalytics(track, { window, document, waveSeconds: BPH_SURVIVAL_TABLE.batchSeconds }) : undefined;
const surveyedRuns = new WeakSet<Run>();
const availableGenerals = BPH_GENERALS;
function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`화면 요소가 없습니다: ${id}`);
  return value as T;
}
const overlay = element("overlay"), intro = element("intro"), choices = element("choice"), result = element("result");
const cards = element("cards"), notice = element("notice"), reelStrip = element("strip"), drills = element("drills"), skillRow = element("skills"), banner = element("cut-in");
const generalHires = element("general-hires");
const weatherHud = mountWeatherHud(element("app"));
type Saved = { story: boolean; firstBattleGuide: boolean; muted: boolean; timers: boolean; motionOff: boolean; flashesOff: boolean; record: { plays: number; wins: number; kills: number; score: number; fastest: number } };
const STORE = "haengju1593";
const STORY_MODE_ENABLED = import.meta.env.STORY_MODE_ENABLED;
function load(): Saved {
  const fresh: Saved = { story: false, firstBattleGuide: false, muted: audioState().muted, timers: true, motionOff: false, flashesOff: false, record: { plays: 0, wins: 0, kills: 0, score: 0, fastest: 0 } };
  try {
    const kept = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<Saved>;
    return { ...fresh, ...kept, record: { ...fresh.record, ...kept.record } };
  } catch { return fresh; }
}
const saved = load(), meta = loadMeta();
const skillHits = new WeakMap<Effect, SkillVfx>();
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
setupPanelMotion();
const app = element("app"), titleLayer = element("title"), logo = element("logo"), story = element("story"), picker = element("pick"), starters = element("starter-cards"), barracks = element("barracks");
if (levelBadgeMockup) app.classList.add("level-badge-mockup");
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
    onPanel: panel => analytics?.screen(panel === "upgrades" ? "tree" : panel === "relics" ? "relic" : "prep"),
    onCommander: (name, selected) => analytics?.choice({ item_kind: "general", item_key: name, choice_kind: selected ? "selected" : "offered" }),
    effects: () => activeBphEffects(bphSave), panels: {
      upgrades: async (host, context) => (await import("./bph-upgrade-view")).renderBphUpgrades(host, { ...context,
        onPurchase: analytics?.upgrade }),
      relics: (host, context) => renderBphRelics(host, { ...context,
        onEquip: item_key => analytics?.choice({ item_kind: "relic", item_key, choice_kind: "selected" }) }),
    },
    onSave: () => {
      const effects = activeBphEffects(bphSave);
      refreshBphEffects(bphSave, effects); projectBphSalary(bphSave, effects);
      prepareBphManagementShop(bphSave, effects);
      for (const placementId of bphSave.purchasedPlacements) notifyBphQuestCompletion(bphSave, placementId);
      keepMeta(meta);
      announceBphRelics();
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
  observeRelics();
  const gained = takeBphRelicNotices(bphSave);
  if (!gained.length) return;
  keepMeta(meta);
  showBphRelicToast(app, gained, () => {
    const tab = bphScreen.hidden ? null : bphScreen.querySelector<HTMLButtonElement>('[data-bph-tab="relics"]');
    if (!tab) { showBphShop("relics"); return; }
    if (tab.getAttribute("aria-pressed") !== "true") tab.click();
  });
}
function observeRelics(current?: Run): void {
  if (analytics) analytics.relics(bphSave, { eligible: !current || analytics.accepts(current), seconds: current?.time ?? 0 });
  else takeBphRelicAcquisitions(bphSave);
}
const tone = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** On a device set to reduce motion the big hits shake less, skip the screen flash and stop shorter. */
const stillness = matchMedia("(prefers-reduced-motion: reduce)");
let paused = false, calm = stillness.matches, dealtAt = 0, picking = false, attract = false, queuedStart: General | null = null, lastReel = -1, settled = "", rolled = "";
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
let sandbox: import("./sandbox/panel").Sandbox | undefined;
let run: Run | null = null, effects: Effect[] = [], shownPhase = "ready", runSerial = 0, aims: (Aim | null)[] = [];
for (const eventName of ["pointerdown", "pointermove"] as const) element("app").addEventListener(eventName, event => {
  if (!run || paused || !(event.target instanceof Element) ||
    !element("arena").contains(event.target)) return;
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
/** A survival join card: the general's front figure as the codex shows him, his name, his skill's own button picture with its
 *  name small under it, and the codex figure of the class he leads under a small "이끄는 병종" (not an unlock; owner DM 1794893287). */
function joinCard(general: BphGeneral): string {
  const skill = SKILL_NAMES[general], army = BPH_GENERAL_CLASS[general];
  return `<span class="join-ribbon" data-ko="합류">${t("합류")}</span><span class="join-figure" data-join-figure="${general}"></span>${named(general)}`
    + `<span class="join-skill"><img src="${skillIconFile(SKILL_ICONS[general])}" alt="" /><small data-ko="${skill}">${t(skill)}</small></span>`
    + `<span class="join-army" title="${t(BPH_CLASS_NAMES[army])}"><small data-ko="이끄는 병종">${t("이끄는 병종")}</small><span class="join-figure" data-join-class="${army}"></span></span>`
    + `<span class="join-glint" aria-hidden="true"></span>`;
}
let codexFigures: Promise<typeof import("./bph-codex-page")> | undefined;
function drawJoinFigures(host: HTMLElement): void {
  void (codexFigures ??= import("./bph-codex-page")).then(({ bphGeneralArt, bphClassArt }) => {
    for (const slot of Array.from(host.querySelectorAll<HTMLElement>("[data-join-figure], [data-join-class]"))) {
      const general = BPH_GENERALS.find(name => name === slot.dataset["joinFigure"]), army = (Object.keys(BPH_CLASS_NAMES) as BphClass[]).find(name => name === slot.dataset["joinClass"]);
      const art = general ? bphGeneralArt(general) : army && bphClassArt(army);
      if (art?.kind !== "sprite") continue;
      const cell = document.createElement("span"), picture = document.createElement("img");
      cell.className = "join-sprite"; picture.src = art.src; picture.alt = "";
      for (const [name, value] of [["--view-x", art.view.x], ["--view-y", art.view.y], ["--view-w", art.view.width], ["--view-h", art.view.height]] as const)
        cell.style.setProperty(name, String(value));
      cell.append(picture); slot.replaceChildren(cell);
    }
  });
}
const opened = () => bphSave.unlockedGenerals.filter(name => availableGenerals.some(general => general === name)).length;
const MERIT = pixelIcon("merit");
const CHARGE_CELLS = Number(tone("--charge-cells"));
document.documentElement.style.setProperty("--charge", `url("${chargeRing("plate")}")`);
for (const [name, kind] of [["--ring", "portrait"], ["--ring-urgent", "urgent"]] as const)
  document.documentElement.style.setProperty(name, `url("${chargeRing(kind)}")`);
function stage(shown: HTMLElement): void {
  if ((shown === story || shown === picker) && !STORY_MODE_ENABLED) return;
  if (shown === barracks) { showBphShop("upgrades"); return; }
  for (const layer of [logo, story, picker, barracks]) layer.hidden = layer !== shown;
  app.classList.toggle("fronted", shown === logo);
  element("barracks-pip").hidden = true;
  element("barracks-open").classList.toggle("ready", META_NODES.some(entry => canBuy(meta, entry.id)));
  if (shown === logo) { checkGeneralUnlocks(meta, element("start")); refreshCodexEntry(bphSave); if (!app.classList.contains("loading")) announceBphRelics(); }
  if (shown !== picker) return;
  picker.scrollTop = 0;
  starters.replaceChildren(...availableGenerals.map((general, order) => {
    const button = document.createElement("button"), locked = order >= opened();
    button.className = `card starter epic${locked ? " locked" : ""}`; button.dataset["startGeneral"] = general; button.disabled = locked;
    button.setAttribute("aria-label", tr`${general}, ${SOLDIER_NAMES[GENERAL_CLASS[general]]}`);
    button.innerHTML = generalCard(general, 1, true) + (locked ? `<img class="lock" src="${LOCK}" alt="" />` : "");
    button.addEventListener("click", () => {
      if (attract && !picker.hidden) begin(randomSeed(), false, { general, storyMode: true });
    });
    return button;
  }));
}
const codexScreen = document.createElement("div");
codexScreen.className = "bph-screen"; codexScreen.hidden = true; app.append(codexScreen);
codexScreen.style.setProperty("--red-deep", "var(--green)");
codexScreen.style.setProperty("--red", "var(--gold)");
let closeCodex: (() => void) | undefined, codexRequest = 0;
async function openCodex(): Promise<void> {
  const request = ++codexRequest;
  const battle = !attract && run?.bph && run.phase === "playing" ? run : undefined;
  const { renderBphCodex } = await import("./bph-codex");
  if (request !== codexRequest) return;
  // Laid out but not painted until its pictures have pixels (opened before the title preload finished).
  closeCodex?.(); codexScreen.style.visibility = "hidden"; codexScreen.hidden = false;
  const reveal = async () => {
    await imagesReady(codexScreen, 400);
    if (request !== codexRequest || codexScreen.hidden) return false;
    codexScreen.style.visibility = "";
    return true;
  };
  const onClose = () => {
    ++codexRequest;
    analytics?.codex();
    closeCodex?.(); closeCodex = undefined; codexScreen.hidden = true; refreshCodexEntry(bphSave);
    if (battle) codexEntry.focus();
  };
  // Preview builds only: `?codex=all` draws a detached copy with everything found; the real save is never written.
  if (import.meta.env.CASTLE_CODEX_PREVIEW && parameters.get("codex") === "all") {
    const { bphCodexPreviewNotice, bphCodexPreviewSave } = await import("./bph-codex-preview");
    if (request !== codexRequest) return;
    closeCodex = renderBphCodex(codexScreen, { save: bphCodexPreviewSave(bphSave), milestones: bphMilestones(meta),
      notice: bphCodexPreviewNotice(), onChange: () => undefined, onClose });
    await reveal();
    return;
  }
  if (!battle) checkGeneralUnlocks(meta, element("start"));
  closeCodex = renderBphCodex(codexScreen, { save: bphSave, readOnly: Boolean(battle), milestones: bphMilestones(meta),
    onChange: () => keepMeta(meta), onClose });
  if (await reveal() && (!battle || analytics?.accepts(battle))) analytics?.codex(battle ? "battle" : "title");
}
const titleCodexMenu = element("start").parentElement ?? logo;
const refreshCodexEntry = mountBphCodexEntry(titleCodexMenu, openCodex);
const codexEntry = element("codex-open");
logo.addEventListener("click", () => startBgm());
element("start").addEventListener("click", () => {
  startBgm(); showBphShop();
});
element("story-mode").addEventListener("click", () => {
  if (!STORY_MODE_ENABLED) { element<HTMLDialogElement>("story-dialog").showModal(); return; }
  if (attract && !paused) stage(story);
});
story.addEventListener("click", () => { if (!story.hidden) stage(picker); });
element("barracks-open").addEventListener("click", () => stage(barracks));
for (const home of ["barracks-close", "pick-back"]) element(home).addEventListener("click", () => stage(logo));
element("title-settings").addEventListener("click", () => { if (run && !paused) menu(true, "title"); });
stage(logo);
if (import.meta.env.CASTLE_CODEX_PREVIEW && parameters.get("codex") === "all") void openCodex();
function tap(target: HTMLElement, act: () => void): void {
  target.addEventListener("pointerdown", event => { event.preventDefault(); act(); });
  target.addEventListener("click", act);
}
/** A join card answers the tap only once it has turned face up (JOIN_REVEAL), so a hidden card is never picked mid-turn. */
const JOIN_REVEAL = { dim: 200, step: 180, turn: 320 };
function pick(button: HTMLElement, target: Point, apply: () => void): void {
  if (picking || button.classList.contains("spinning")) return;
  const joining = button.classList.contains("join"), still = calm || saved.motionOff;
  if (joining && !still && performance.now() < dealtAt + JOIN_REVEAL.dim + JOIN_REVEAL.step * Number(button.style.getPropertyValue("--order") || 0) + JOIN_REVEAL.turn) return;
  picking = true; playSfx("pick");
  const from = button.getBoundingClientRect(), field = game.canvas.getBoundingClientRect();
  const x = field.left + target.x / WIDTH * field.width, y = field.top + target.y / HEIGHT * field.height;
  // The general not taken greys and sinks away; the chosen join card beats twice in gold before it flies to the south gate.
  for (const other of Array.from(cards.children)) if (other !== button) other.animate(joining
    ? [{ opacity: 1, filter: "none" }, { opacity: 0, filter: "grayscale(1) brightness(.6)", transform: still ? "none" : "translateY(26px)" }]
    : [{ opacity: 1 }, { opacity: 0, transform: "translateY(26px)" }], { duration: joining ? 260 : 170, fill: "forwards" });
  button.style.zIndex = "2";
  if (joining && !still) {
    button.classList.add("picked");
    const glow = "drop-shadow(0 0 6px #ffe29a) brightness(1.35)";
    button.animate([{ transform: "none", filter: "none" }, { transform: "scale(1.08)", filter: glow, offset: .25 }, { transform: "none", filter: "none", offset: .5 },
      { transform: "scale(1.08)", filter: glow, offset: .75 }, { transform: "none", filter: "none" }], { duration: 340, easing: "steps(2, end)" }).onfinish = () => fly(button, from, x, y, apply);
  } else fly(button, from, x, y, apply);
}
function fly(button: HTMLElement, from: DOMRect, x: number, y: number, apply: () => void): void {
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
  if (cast.length) {
    if (run.squads[id].general === "곽재우") {
      const scene = game.scene.getScene("castle");
      if (scene instanceof CastleScene) scene.dismissAim();
    }
    herald(run.squads[id].general);
    const seat = skillRow.children[id];
    const button = (levelBadgeMockup ? seat?.querySelector("button") : seat) as HTMLElement | undefined;
    if (button) skillButtonCast(button, cast, feedbackChannels(saved.motionOff, saved.flashesOff, calm));
  }
  noteCast(cast); effects.push(...cast); updateHud();
}
const HERALD_MS = 500, CALLOUT_MS = 720;
/** A skill's big moment: the general's portrait rides a banner across the top of the field, the same place for every general, and a
 *  live enemy warning under it shows through. A staged skill also calls out its name and stays long enough to be read. With motion
 *  off the banner holds still and only fades. */
function herald(general: General): void {
  const face = banner.querySelector("img")!, title = banner.querySelector("strong")!;
  const staged = SKILL_SHOWS.find(show => show.general === general), ms = staged ? CALLOUT_MS : HERALD_MS, still = calm || saved.motionOff;
  for (const old of [...banner.getAnimations(), ...face.getAnimations(), ...title.getAnimations()]) old.cancel();
  face.src = `./art/portraits/${portrait(general)}.png`; title.textContent = staged ? t(SKILL_NAMES[general]) : ""; banner.hidden = false;
  banner.classList.remove("join");
  if (staged) banner.style.setProperty("--cut-in-band", color(staged.accent)); else banner.style.removeProperty("--cut-in-band");
  if (!still) face.animate([{ transform: "translateX(-50%)" }, { transform: "none", offset: .2 }, { transform: "translateX(8%)", offset: .8 }, { transform: "translateX(60%)" }], ms);
  if (!still && staged) title.animate([{ transform: "translateX(var(--space-6))", opacity: 0 }, { transform: "translateX(calc(var(--space-1) * -1))", opacity: 1, offset: .2 },
    { transform: "none", opacity: 1, offset: .28 }, { transform: "none", opacity: 1, offset: .8 }, { transform: "translateX(calc(var(--space-5) * -1))", opacity: 0 }], ms);
  banner.animate(still ? [{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .8 }, { opacity: 0 }] : [
    { clipPath: "inset(0 100% 0 0)", filter: "brightness(3)" }, { clipPath: "inset(0 0 0 0)", filter: "brightness(1)", offset: .2 },
    { clipPath: "inset(0 0 0 0)", filter: "brightness(1)", offset: .8 }, { clipPath: "inset(0 0 0 100%)", filter: "brightness(1)" },
  ], ms).onfinish = () => { banner.hidden = true; };
}
/** A survival join calls '<name> 합류' from the same top banner a skill uses, on a wood-and-gold band: red stays the enemy's warning colour. */
function joinHerald(general: General): void {
  const face = banner.querySelector("img")!, title = banner.querySelector("strong")!, ms = 1500;
  for (const old of [...banner.getAnimations(), ...face.getAnimations(), ...title.getAnimations()]) old.cancel();
  face.src = `./art/portraits/${portrait(general)}.png`; title.textContent = tr`${general} 합류`; banner.hidden = false;
  banner.classList.remove("low"); banner.classList.add("join"); banner.style.removeProperty("--cut-in-band");
  const still = calm || saved.motionOff;
  if (!still) face.animate([{ transform: "translateX(-50%)" }, { transform: "none", offset: .15 }, { transform: "translateX(6%)", offset: .85 }, { transform: "translateX(60%)" }], ms);
  if (!still) title.animate([{ transform: "translateX(var(--space-6))", opacity: 0 }, { transform: "translateX(calc(var(--space-1) * -1))", opacity: 1, offset: .15 },
    { transform: "none", opacity: 1, offset: .22 }, { transform: "none", opacity: 1, offset: .85 }, { transform: "translateX(calc(var(--space-5) * -1))", opacity: 0 }], ms);
  banner.animate(still ? [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .85 }, { opacity: 0 }] : [
    { clipPath: "inset(0 100% 0 0)", filter: saved.flashesOff ? "none" : "brightness(2.2)" }, { clipPath: "inset(0 0 0 0)", filter: "brightness(1)", offset: .15 },
    { clipPath: "inset(0 0 0 0)", filter: "brightness(1)", offset: .85 }, { clipPath: "inset(0 0 0 100%)", filter: "brightness(1)" },
  ], ms).onfinish = () => { banner.hidden = true; banner.classList.remove("join"); };
}
/** The cut-in banner's box in field pixels while it shows: a skill's big number never pops behind its rows, and enemy warnings show through it. */
function bannerBox(canvas: HTMLCanvasElement, cssPixel: number): Rect | undefined {
  if (banner.hidden) return undefined;
  const box = banner.getBoundingClientRect(), field = canvas.getBoundingClientRect();
  return { left: (box.left - field.left) * cssPixel, top: (box.top - field.top) * cssPixel, right: (box.right - field.left) * cssPixel, bottom: (box.bottom - field.top) * cssPixel };
}
/** Opens the banner's windows over the enemy warnings under it now, every frame it shows, as warnings come and land. */
function thinBanner(marks: readonly Telegraph[], cssPixel: number): void {
  const box = bannerBox(game.canvas, cssPixel);
  if (!box) return;
  const mask = windowMask(box, bannerWindows(box, marks), 1 / cssPixel);
  if (mask !== banner.style.getPropertyValue("--cut-in-windows")) banner.style.setProperty("--cut-in-windows", mask);
}
/** One square skill picture per general above the experience bar: it lights from the bottom as the skill charges, and a full picture glows until it is tapped. */
function syncSkills(current: Run): void {
  while (skillRow.children.length > current.squads.length) skillRow.lastElementChild?.remove();
  current.squads.forEach((squad, id) => {
    const { tier } = growthFor(squad.general, current);
    // A general who joins gets a new button; the ones already seated stay, so they keep their glow and the keyboard's focus.
    const seat = skillRow.children[id];
    const seated = (levelBadgeMockup ? seat?.querySelector("button") : seat) as HTMLButtonElement | undefined;
    const button = seated?.dataset["general"] === squad.general ? seated : document.createElement("button");
    const description = UNIQUE_SKILL_DESCRIPTIONS[squad.general];
    if (description) button.title = `${t(SKILL_NAMES[squad.general])}: ${t(description)}`;
    if (button !== seated) {
      button.className = "skill icon-button big"; button.type = "button"; button.dataset["general"] = squad.general; button.setAttribute("aria-label", tr`${squad.general} ${SKILL_NAMES[squad.general]}`);
      const image = `<span class="skill-glyph">${skillPicture(squad.general)}</span>`;
      button.innerHTML = `<span class="skill-art">${image}<span class="skill-bright">${image}</span></span><img class="skill-portrait" src="./art/portraits/${portrait(squad.general)}.png" alt="" />${skillPips(tier)}<b class="skill-fallen" hidden></b>`;
      tap(button, () => { if (!paused) fire(id); });
      // The portrait tap is the player's: it never also reaches a field tap underneath.
      button.addEventListener("pointerdown", event => event.stopPropagation());
      if (levelBadgeMockup) {
        const slot = document.createElement("span"), badge = document.createElement("span");
        slot.className = "skill-slot"; badge.className = "skill-level-badge";
        slot.append(button, badge);
        if (seat) seat.replaceWith(slot); else skillRow.append(slot);
      } else if (seated) seated.replaceWith(button); else skillRow.append(button);
    }
    if (levelBadgeMockup) {
      const badge = button.parentElement!.querySelector<HTMLElement>(".skill-level-badge")!;
      // This source revision records one shared battle level, not separate levels per general.
      const level = sharedLevel(current) === undefined ? undefined : reachLevel(current);
      updateGeneralLevelBadge(badge, level, squad.tier, saved.flashesOff, matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
    // A general who will not rise (no temple) keeps his card, marked fallen; one waiting to rise is hidden as before.
    const down = squad.state === "down", fallen = down && squad.downUntil === Infinity, ready = skillReady(squad);
    const lit = skillCharge(squad.skillClock, BALANCE.cooldown[squad.general]);
    const urgent = current.telegraphs.length > 0, frenzy = squad.frenzyUntil > current.time;
    const state = `${lit}:${down}:${fallen}:${ready}:${urgent}:${frenzy}:${tier}:${language()}`;
    if (button.dataset["state"] === state) return;
    button.dataset["state"] = state; button.style.setProperty("--lit", String(lit)); button.style.setProperty("--fill", `${lit / 12 * 100}%`); button.disabled = down; button.hidden = down && !fallen;
    if (levelBadgeMockup) button.parentElement!.hidden = down && !fallen;
    const mark = button.querySelector<HTMLElement>(".skill-fallen")!;
    mark.hidden = !fallen; mark.textContent = t("쓰러짐");
    button.classList.toggle("fallen", fallen);
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
/** One entry per survival building tap; each building's own lane answers here (barracks A, smithy B, temple C). */
function tapBphBuilding(building: BphCastleBuilding): void {
  switch (building) {
    case "barracks":
      if (run && collectBphBarracks(run)) { keepMeta(meta); analytics?.draws(run); observeRelics(run); }
      return;
    case "smithy": toggleBphSmithy(bphField); return;
    case "temple": if (run && collectBphTemple(run)) keepMeta(meta); return;
  }
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
    if (serial === runSerial && run?.phase === "lost") {
      result.hidden = false;
      if (analytics?.accepts(run)) analytics.screen("result");
    }
  }, DEFEAT_HOLD);
}
const minutes = (time: number) => {
  const seconds = Math.floor(time);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};
/** The screen a run shows: a survival join hand stands over the running battle as its own "general" screen. */
function viewPhase(current: Run): Run["phase"] {
  return current.phase === "playing" && current.bph && generalHandOpen(current) ? "general" : current.phase;
}
function updateHud(): void {
  if (!run) return;
  if (attract) return;
  if (calm || saved.motionOff) cards.querySelectorAll(".reel-strip").forEach(strip => strip.getAnimations().forEach(animation => animation.finish()));
  updateBphField?.();
  // The first-foil explainer, once per account, as a toast over the running battle (owner DM 1794929475: never a modal).
  // It waits until the recruit result card has closed, so it follows the foil's in-place reveal.
  if (run.bph && !(run.bph.save.foilTooltipSeen && run.bph.save.foilHintVersion === 1) && run.phase === "playing" && !paused
    && !document.querySelector("dialog[open], .bph-receipt:not([hidden])")
    && run.squads.some(squad => squad.soldiers.some(unit => unit.bph?.foil))) {
    const hint = takeBphFoilTooltip(run.bph.save);
    if (hint) { keepMeta(meta); showBphFoilTooltip(app, hint); }
  }
  element("synergies").hidden = true;
  const clock = minutes(run.time);
  const hud = element("clock");
  if (!run.bph?.survival) hud.textContent = clock;
  else if (run.endless) hud.innerHTML = `<small class="clock-label">${t("무한")}</small>${clock}`;
  else if (run.time >= BPH_SURVIVAL_TABLE.duration && bphSurvivalFinalsRemain(run))
    hud.innerHTML = `${minutes(BPH_SURVIVAL_TABLE.duration)}<small class="clock-note">${t("최종 장수 남음")}</small>`;
  else hud.textContent = clock;
  const bar = element("xp"), mastery = element("mastery-earned"), value = element("mastery-earned-value");
  bar.hidden = Boolean(run.bph); mastery.hidden = !run.bph;
  if (run.bph) {
    // Owner DM 1794892484.261299: icon and number only; the full words stay in the accessible name.
    value.textContent = `+${bphBattleMedals(run).toLocaleString("en-US")}`;
    mastery.setAttribute("aria-label", tr`강화 포인트 +${bphBattleMedals(run).toLocaleString("en-US")}`);
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
  const phase = viewPhase(run);
  if (shownPhase === phase && (phase !== "choice" || rolled === `${runSerial}:${run.metrics.cards.length}`)) return;
  shownPhase = phase;
  if (phase !== "playing") notice.classList.remove("visible");
  overlay.hidden = phase === "playing"; intro.hidden = true;
  const reward = phase === "choice" || phase === "general";
  overlay.classList.toggle("reward", reward);
  // A join hand dims the battle and beats a drum before its two cards turn in; the classes carry the player's motion and flash settings.
  const joinHand = phase === "general" && Boolean(run.bph), channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
  overlay.classList.toggle("join-hand", joinHand); overlay.classList.toggle("join-still", !channels.motion); overlay.classList.toggle("join-plain", !channels.flash);
  if (joinHand) { playSfx("land"); playSfx("land", .2); }
  element("pause").classList.remove("has-cards");
  if (reward) { dealtAt = performance.now(); playSfx("levelup"); element("building").hidden = true; }
  choices.hidden = phase !== "choice" && phase !== "general";
  result.hidden = phase !== "won" && phase !== "lost";
  if (analytics?.accepts(run) && !paused && result.hidden) analytics.screen("battle");
  if (phase === "general") {
    analytics?.offerGenerals(run);
    const gate = { x: CENTER.x, y: fortRect(run.fort).bottom };
    cards.replaceChildren(...run.generalOffers.map((general, order) => {
      const joining = run?.bph ? BPH_GENERALS.find(name => name === general) : undefined, button = document.createElement("button");
      button.className = joining ? "card join legend" : "card awaken epic"; button.dataset["general"] = general;
      if (joining) button.style.setProperty("--order", String(order));
      button.innerHTML = joining ? joinCard(joining) : generalCard(general);
      if (joining) button.setAttribute("aria-label", tr`${joining} 합류: ${SKILL_NAMES[joining]}`);
      tap(button, () => pick(button, joining ? gate : CENTER, () => {
        if (!run || !generalHandOpen(run)) return;
        const joined = chooseGeneral(run, general); effects.push(...joined);
        if (joining && joined.length) {
          if (analytics?.accepts(run)) analytics.choice({ item_kind: "general", item_key: joining, choice_kind: "selected" }, run.time);
          joinHerald(joining);
        }
      }));
      return button;
    }));
    drawJoinFigures(cards);
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
    const outcome = run.endless && run.bph ? "무한 기록" : run.phase === "won" ? "승리" : "패배";
    element("result-endless").hidden = !(run.phase === "won" && run.bph?.survival && !run.endless);
    element("result-title").innerHTML = `<img src="${pixelIcon(run.phase === "won" ? "trophy" : "skull")}" alt="" /><b data-ko="${outcome}">${t(outcome)}</b>`;
    result.querySelector<HTMLImageElement>(".commander")!.src = `./art/portraits/${portrait(run.commander)}.png`;
    element("building").hidden = true;
    element("result-time").textContent = `${Math.floor(run.time / 60)}:${String(Math.floor(run.time % 60)).padStart(2, "0")}`;
    element("result-score").textContent = run.earned.toLocaleString("ko-KR");
    element("result-kills").textContent = run.kills.toLocaleString("ko-KR");
    const record = saved.record, ending = `${runSerial}:${run.phase}`;
    if (settled !== ending) {
      settled = ending;
      analytics?.finish(run);
      const hold = run.phase === "lost" ? DEFEAT_HOLD : 0;
      const tally = element("result-merit");
      const before = new Set(bphSave.unlockedGenerals);
      let merit = run.endless ? 0 : run.bph ? bphBattleMedals(run) : meritFor(run.kills, run.time, run.metrics.bosses.filter(boss => boss.fallen !== null).length);
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
      if (analytics?.accepts(run) && !result.hidden) analytics.screen("result");
      else if (result.hidden) analytics?.screen();
      if (publicGame && run.bph && !run.endless && !surveyedRuns.has(run)) {
        surveyedRuns.add(run);
        notifySurveyRunEnd?.(run);
      }
      if (unlocked.length) setTimeout(() => requestAnimationFrame(() => {
        if (settled !== ending || result.hidden) return;
        showResultUnlocks(unlocked, element("retry")); playSfx("evolve");
      }), hold);
      if (run.bph && run.endless) {
        const best = recordEndlessBest(meta, run), summary = document.createElement("p");
        keepMeta(meta);
        summary.textContent = tr`처치 ${run.kills} · 최고 기록 ${minutes(best.seconds)} · 최고 처치 ${best.kills}`;
        element("result-damage").replaceChildren(summary);
      } else if (run.bph) {
        // Kills sit in the icon row (sword) and upgrade points on the medal, so no summary line.
        element("result-damage").replaceChildren();
      } else element("result-damage").replaceChildren(diagnosis(run, meta));
      element("result-upgrade").classList.toggle("ready", META_NODES.some(entry => canBuy(meta, entry.id)));
    }
  }
}
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
function begin(seed: number, demoRun: boolean, entry: {
  readonly general: General; readonly endless?: boolean; readonly storyMode?: boolean;
} = { general: startingGeneral }): void {
  if (entry.storyMode && !STORY_MODE_ENABLED) return;
  const { general } = entry;
  const arena = element("arena");
  setFieldSize(Math.round(800 * arena.clientWidth / arena.clientHeight / 2) * 2, 800);
  game.scale.setGameSize(WIDTH, HEIGHT);
  game.scale.setParentSize(arena.clientWidth, arena.clientHeight);
  attract = demoRun;
  if (!demoRun) closeBphRelicToast();
  const selected = BPH_GENERALS.find(name => name === general) ?? "권율";
  run = demoRun ? createRun(seed, general, undefined, availableGenerals)
    : entry.storyMode ? createRun(seed, general, getMetaBonuses(), availableGenerals)
    : createBphRun(meta, { seed, general: selected, upgrades: activeBphEffects(bphSave), endless: entry.endless });
  if (entry.endless) enterEndless(run);
  if (!demoRun && run.bph && !entry.endless) analytics?.start(run);
  if (!demoRun && run.bph) observeRelics(run);
  if (!demoRun && run.bph && !entry.endless && bphSave.unlockedGenerals.length > 1) codexFigures ??= import("./bph-codex-page");
  weatherHud.start(run.weather, !demoRun);
  bphField.replaceChildren(); generalHires.replaceChildren(); updateBphField = undefined;
  if (run.bph) {
    const battle = run;
    prepareBphFieldShop(battle);
    updateBphField = renderBphField(bphField, generalHires, battle, bphMilestones(meta), () => {
      keepMeta(meta);
      analytics?.draws(battle);
      observeRelics(battle);
    }, name => playSfx(name), point => {
      // World to field-layer pixels through the live camera, so the barracks glint follows zoom and shake.
      const camera = game.scene.getScene("castle")?.cameras.main, canvas = element("arena").querySelector("canvas");
      if (!camera || !canvas) return null;
      const projected = { x: camera.x + (point.x - camera.worldView.x) * camera.zoom, y: camera.y + (point.y - camera.worldView.y) * camera.zoom };
      const view = canvas.getBoundingClientRect(), host = bphField.getBoundingClientRect();
      return { x: view.left - host.left + projected.x / WIDTH * view.width, y: view.top - host.top + projected.y / HEIGHT * view.height };
    }, purchase => {
      keepMeta(meta);
      if (analytics?.accepts(battle)) analytics.upgrade(purchase);
      const forge = buildings().forge;
      effects.push({ kind: "upgrade", x: forge.x, y: forge.y, value: 1 });
    }, slot => {
      const joined = hireBphGeneral(battle, slot);
      if (!joined.length) return;
      const general = bphHireSlots(battle)[slot]?.general;
      if (general && analytics?.accepts(battle)) analytics.choice({ item_kind: "general", item_key: general, choice_kind: "auto" }, battle.time);
      effects.push(...joined);
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
    if (!app.classList.contains("loading") && bphScreen.hidden) analytics?.screen("title");
    overlay.hidden = false; overlay.classList.remove("reward"); setBgmIntensity(0);
    intro.hidden = choices.hidden = result.hidden = true;
  } else {
    updateHud();
    if (!saved.firstBattleGuide) {
      paused = firstBattleGuideOpen = true;
      showFirstBattleGuide(outcome => {
        if (run && analytics?.accepts(run)) analytics.tutorial(outcome);
        saved.firstBattleGuide = true; keep();
        firstBattleGuideOpen = paused = false;
        updateHud(); element("pause").focus();
      });
      if (analytics?.accepts(run)) { analytics.tutorial("shown"); analytics.screen("tutorial"); }
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
/** Explosion pictures from the drawn sheets, largest first, at whole or half pixel scale only. */
const BLAST_LOOKS = [
  { texture: "blast", animation: "explosion", scale: 1, width: 64 },
  { texture: "boom", animation: "boom", scale: 1, width: 32 }, { texture: "boom", animation: "boom", scale: .5, width: 16 },
] as const;
const DIRECT_SOUNDS: Partial<Record<Effect["kind"], SfxName>> = { blast: "blast", telegraph: "telegraph", land: "land", wall: "wall", hurt: "hurt", down: "down", block: "block", interrupt: "block", upgrade: "levelup",
  wave: "horn", evolution: "evolve", rift: "evolve", expand: "levelup", join: "levelup", "boss-enter": "horn", rage: "land", ladder: "wall" };
function cue(effect: Effect, current: Run): void {
  const squad = current.squads[effect.squad ?? -1], direct = DIRECT_SOUNDS[effect.kind];
  if (direct) playSfx(direct);
  else if (effect.kind === "hit" && effect.value > 0) playSfx(effect.critical ? "crit" : effect.minor ? "hit" : "heavy");
  else if (effect.kind === "windup") playSfx("prepare", Math.max(0, effect.value - .08));
  else if (effect.kind === "kill") playSfx("kill", .05);
  else if (effect.kind === "shot") playSfx(effect.by === "hwacha" || effect.by === "panokseon" ? "rocket" : "arrow");
  else if (effect.kind === "skill" && squad) playSfx(SKILL_SOUNDS[squad.general]);
  else if (effect.kind === "prize") playSfx(effect.value >= 3 ? "win" : effect.value >= 2 ? "evolve" : "prize");
}
element("home").addEventListener("click", () => { if (run) analytics?.quit(run); stage(logo); title(); startBgm(); });
element("retry").addEventListener("click", () => {
  if (run && !result.hidden) analytics?.retry(run);
  showBphShop();
});
element("barracks-play").addEventListener("click", () => showBphShop());
element("result-upgrade").addEventListener("click", () => { stage(barracks); title(); startBgm(); });
element("result-endless").addEventListener("click", () => {
  // The 15:00 win is already settled; endless keeps the same battlefield and director.
  if (!run?.bph?.survival || run.phase !== "won" || run.endless) return;
  analytics?.screen();
  enterEndless(run); result.hidden = true; startBgm(); updateHud();
});
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
  if (run?.bph) {
    element("mastery-earned-value").textContent = `+${bphBattleMedals(run).toLocaleString("en-US")}`;
    element("mastery-earned").setAttribute("aria-label", tr`강화 포인트 +${bphBattleMedals(run).toLocaleString("en-US")}`);
  }
}
element("toggle-lang").addEventListener("click", () => {
  setLanguage(language() === "ko" ? "en" : "ko"); relabel();
  if (!run?.endless) analytics?.setting({ setting_key: "language", setting_value: language() });
});
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
  resetRecords.hidden = !open || context === "battle";
  if (open && context === "battle" && run?.bph && run.phase === "playing") {
    element("home").before(codexEntry);
  } else {
    titleCodexMenu.insertBefore(codexEntry, titleCodexMenu.lastElementChild);
  }
  if (open) {
    if (context === "title") analytics?.screen("settings");
    else if (run && analytics?.accepts(run)) analytics.screen("pause");
    notice.classList.remove("visible");
    element(context === "title" ? "toggle-sound" : "resume").focus();
  }
  if (!open && attract) analytics?.screen("title");
}
element("pause").addEventListener("click", () => { if (run && !paused) menu(true); });
element("resume").addEventListener("click", () => { if (run && paused) { menu(false); element("pause").focus(); } });
element("settings-close").addEventListener("click", () => {
  menu(false); element("title-settings").focus();
});
const resetRecords = element<HTMLButtonElement>("reset-records"), resetDialog = element<HTMLDialogElement>("reset-dialog");
resetRecords.addEventListener("click", () => {
  if (attract && paused && !resetRecords.hidden) resetDialog.showModal();
});
element("confirm-reset").addEventListener("click", () => {
  if (!attract || !paused || !resetDialog.open) return;
  // Audio and language have their own keys. Remove only this game's records and other preferences.
  for (const key of [STORE, META_STORE, DAMAGE_NUMBERS_STORE]) localStorage.removeItem(key);
  location.reload();
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || intro.hidden || !codexScreen.hidden || resetDialog.open) return;
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
  document.documentElement.classList.toggle("motion-off", saved.motionOff);
  element("toggle-flashes").setAttribute("aria-pressed", String(saved.flashesOff));
  element("toggle-numbers").setAttribute("aria-pressed", String(damageNumbersOn()));
  for (const [id, enabled] of [["toggle-sound", !saved.muted], ["toggle-motion", !saved.motionOff], ["toggle-flashes", !saved.flashesOff], ["toggle-numbers", damageNumbersOn()]] as const) {
    const button = element(id);
    button.dataset["enabled"] = String(enabled);
    button.querySelector(".toggle-state")!.textContent = t(enabled ? "켜짐" : "꺼짐");
  }
}
document.addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest("button");
  let change: readonly [setting: "sound" | "timer" | "motion" | "flash" | "damage_numbers", enabled: boolean];
  if (button?.classList.contains("toggle-sound")) { saved.muted = !saved.muted; setMuted(saved.muted); change = ["sound", !saved.muted]; }
  else if (button?.classList.contains("toggle-timers")) { saved.timers = !saved.timers; change = ["timer", saved.timers]; }
  else if (button?.id === "toggle-motion") { saved.motionOff = !saved.motionOff; change = ["motion", !saved.motionOff]; }
  else if (button?.id === "toggle-flashes") { saved.flashesOff = !saved.flashesOff; change = ["flash", !saved.flashesOff]; }
  else if (button?.id === "toggle-numbers") { setDamageNumbersOn(!damageNumbersOn()); change = ["damage_numbers", damageNumbersOn()]; }
  else return;
  keep(); syncToggles();
  if (!run?.endless) analytics?.setting({ setting_key: change[0], setting_value: change[1] ? "on" : "off" });
});
syncToggles();

type Trooper = { unitId: number; sprite: Phaser.GameObjects.Sprite; prism?: Phaser.GameObjects.Sprite; key: string; windFor: number; strikeAt: number; hurtAt: number; fellAt: number; downAt: number; aimX: number; aimY: number; attackTargetId?: number; motion: EnemyMotion; faceLeft: boolean; turnX: number; rest: Point; cycle: AttackCycle };
const cavalryPose = (key: string): boolean => key === "joseon_cavalry" || key === "ming_cavalry"
  || key === "shin_rip" || key === "li_rusong";
/** Generals and enemies turn only past these x dead-bands: a target nearly straight above or below, or a step back of a pixel or
 * two, otherwise flips them every attack or tick while they hold a spot (owner DMs 1794892344.221279, 1794894265.835729). */
const TURN_DEADBAND = { aim: 8, walk: 4 } as const;
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
/** 빙설's chilled foes: the same frames washed halfway to a pale ice blue (no frost art exists to reuse; the canvas renderer ignores setTint). */
function chillPixels(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0) {
    data[i] = data[i] * .55 + 0xc8 * .45; data[i + 1] = data[i + 1] * .55 + 0xe4 * .45; data[i + 2] = data[i + 2] * .55 + 0xff * .45;
  }
}
let arenaScene: CastleScene | null = null;
/** Holds the preload until the style.css face is ready. That face reuses the index.html preload, so the font downloads once;
 * Phaser's load.font fetched it a second time (no-store) and that copy sat in front of the start button. */
class StyleFontFile extends Phaser.Loader.File {
  constructor(loader: Phaser.Loader.LoaderPlugin, family: string) { super(loader, { type: "stylefont", key: family, url: "" }); }
  override load(): void {
    const done = () => this.loader.nextFile(this, true);
    document.fonts.load(`12px ${this.key}`).then(done, error => { console.warn("Font failed to load", this.key, error); done(); });
  }
}
class CastleScene extends Phaser.Scene {
  private positions = new Map<Point, Point>();
  /** 황진's two cut streaks run on either side of the line. */
  private streakSide = 1;
  private wallLabel: Phaser.GameObjects.Text | null = null;
  private foes = new Map<number, Phaser.GameObjects.Sprite>();
  private strides = new Map<number, EnemyMotion>();
  /** Each enemy's x where it last turned, for TURN_DEADBAND. */
  private turns = new Map<number, number>();
  private missiles = new Map<number, Phaser.GameObjects.Sprite>();
  private troops: Troop[] = [];
  private fortParts: Phaser.GameObjects.GameObject[] = [];
  private ground!: Phaser.GameObjects.Image;
  private river!: Phaser.GameObjects.TileSprite;
  private bank!: Phaser.GameObjects.TileSprite;
  private scenery: Phaser.GameObjects.Image[] = [];
  private wallTiles: WallTile[] = [];
  private wallTier = 0;
  private gateTiles: { image: Phaser.GameObjects.Image; face: "" | "-e" | "-w"; side: Direction }[] = [];
  private keep: { tent: Phaser.GameObjects.Image; flames: Phaser.GameObjects.Sprite[]; stage: number; smokeAt: number } | null = null;
  private yard: { hall: Phaser.GameObjects.Image; forge: Phaser.GameObjects.Image; smokeAt: number; struckAt: number } | null = null;
  private entered = new Map<number, number>();
  private wallWeapons: { kind: "arrow" | "hwacha"; sprite: Phaser.GameObjects.Sprite; slot: Point }[] = [];
  private blasts: Phaser.GameObjects.Sprite[] = [];
  private goldLabel: Phaser.GameObjects.Text | null = null;
  private goldHud!: Phaser.GameObjects.Graphics;
  private emphasis!: BossCamera;
  private goldShown = 0;
  private goldUntil = 0;
  private coins = new Set<Phaser.GameObjects.Image>();
  private coinPool: { coin: Phaser.GameObjects.Image; amount: Phaser.GameObjects.Text }[] = [];
  // Adaptive guard, visuals only: sustained frame overruns trim the heaviest decoration; clean play restores it.
  // The simulation never reads these; levels change only what is drawn.
  private quality: 0 | 1 = 0;
  private slowStreak = 0; private cleanStreak = 0; private qualityHold = 0;
  private guardQuality(delta: number): void {
    const hot = delta > 33.5;
    if (this.qualityHold > 0) { this.qualityHold--; return; }
    if (this.quality) {
      this.cleanStreak = hot ? 0 : this.cleanStreak + 1;
      this.slowStreak = 0;
      if (this.cleanStreak >= 150) { this.quality = 0; this.qualityHold = 90; this.cleanStreak = 0; setBellLean(false); }
    } else {
      this.slowStreak = hot ? this.slowStreak + 1 : Math.max(0, this.slowStreak - 1);
      if (this.slowStreak >= 40) { this.quality = 1; this.qualityHold = 150; this.slowStreak = 0; setBellLean(true); }
    }
  }
  private numberMode(): ReturnType<typeof damageNumbersMode> {
    return this.quality && damageNumbersMode() === "all" ? "big" : damageNumbersMode();
  }
  qualityLevel(): 0 | 1 { return this.quality; }
  forceQuality(level: 0 | 1): void {
    this.quality = level;
    this.qualityHold = level ? Number.MAX_SAFE_INTEGER : 0;
    this.slowStreak = 0; this.cleanStreak = 0;
    setBellLean(level === 1);
  }
  private bossEntries = new Map<number, number>();
  private orders: Order[] = [];
  private builtFort = -1;
  private builtGates = 0;
  private serial = -1;
  private bars!: Phaser.GameObjects.Graphics;
  private readonly healthBoxes: HealthBar[] = [];
  private gaugeImages: { frame: Phaser.GameObjects.Image; fill: Phaser.GameObjects.Image }[] = [];
  private gaugeCount = 0;
  private marks!: Phaser.GameObjects.Graphics;
  private danger!: Phaser.GameObjects.Graphics;
  private shotTails!: Phaser.GameObjects.Graphics;
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
  private tapStrikes?: TapStrikeView;
  private readonly aim = new TapAim();
  private aimRing!: Phaser.GameObjects.Graphics;
  /** The last pointing spot sent to the battle as an aim event ("" for none), so each change is sent once. */
  private aimed = "";
  private readonly held = new Map<Effect, Effect[]>();
  private lastStreak = 0;
  private accumulator = 0;
  private marchers: Marcher[] = [];
  private raiders: Raider[] = [];
  private raidAt = 0;
  constructor() { super("castle"); }
  preload(): void {
    const load = sceneArt(this);
    this.painted.preload(PAINTED_FILES, load);
    const root = import.meta.env.BASE_URL;
    this.load.on("progress", (share: number) => {
      startProgress(share);
      const loading = element("start-loading");
      loading.style.setProperty("--share", String(share));
      loading.setAttribute("aria-valuenow", String(Math.round(share * 100)));
    });
    for (const kind of ["grass", "path"]) for (let variant = 1; variant <= 3; variant++)
      load.image(`${kind}-${variant}`, `${root}art/terrain/${kind}_${variant}.png`);
    for (const direction of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) load.image(`path-${direction}`, `${root}art/terrain/edge/path_${direction}.png`);
    for (const name of ["brush", "rock", "slope_1"]) load.image(name, `${root}art/terrain/${name}.png`);
    WALL_ART.forEach((file, tier) => {
      for (const shape of ["es", "sw", "ne", "nw", "ns", "ew"]) for (const variant of ["a", "b", "c", "d"])
        load.image(`wall-${tier}-${shape}-${variant}`, `${root}art/props/${file}_${shape}_${variant}.png`);
    });
    load.image("tree", `${root}art/props/tree.png`);
    GATE_ART.forEach((file, tier) => {
      load.image(`gate-${tier}`, `${root}art/props/${file}.png`);
      for (const face of ["e", "w"]) load.image(`gate-${tier}-${face}`, `${root}art/props/${file}_${face}.png`);
    });
    CORE_ART.forEach((file, tier) => load.image(`core-${tier}`, `${root}art/props/${file}.png`));
    load.image("scorch", `${root}art/anim/scorch.png`);
    for (const kind of [...ownTextures, ...foeTextures, "ladder"] as const) load.spritesheet(kind, `${root}art/units/${bphArtFile(kind)}.png`, { frameWidth: UNIT_FRAME.width, frameHeight: UNIT_FRAME.height });
    for (const kind of SHIP_TEXTURES) load.spritesheet(kind, `${root}art/ships/${kind}.png`, { frameWidth: SHIP_FRAME.width, frameHeight: SHIP_FRAME.height });
    for (const kind of BPH_SHIP_VARIANT_ART) load.spritesheet(kind, `${root}art/${bphArtPath(kind)}`, { frameWidth: SHIP_FRAME.width, frameHeight: SHIP_FRAME.height });
    load.image("river-water", `${root}art/terrain/river.png`);
    load.image("river-bank", `${root}art/terrain/riverbank.png`);
    for (const [prefix, actors] of [["boss", FULL_ENEMY_ART], ["ally", FULL_ALLY_ART]] as const)
      for (const actor of actors) {
        const art = fullsetArt(actor);
        load.spritesheet(`${prefix}-sheet-${actor}`, `${root}art/${art.file}.webp`,
          { frameWidth: art.frame.width, frameHeight: art.frame.height });
      }
    for (const actor of BOW_ATTACK_ART) load.spritesheet(`ally-bow-${actor}`, `${root}art/generals/${actor}_bow_attack.webp`,
      { frameWidth: BOSS_FRAME.width, frameHeight: BOSS_FRAME.height });
    for (const actor of THROW_ATTACK_ART) load.spritesheet(`ally-throw-${actor}`, `${root}art/generals/${actor}_throw_attack.webp`,
      { frameWidth: BOSS_FRAME.width, frameHeight: BOSS_FRAME.height });
    for (const [key, file, width, height] of [["blast", "fx/blast_big", 64, 64], ["boom", "fx/blast", 32, 32], ["death", "fx/death", 32, 32],
      ["volley", "fx/volley_arc", 32, 32], ["rocket", "fx/volley", 32, 32], ["command", "fx/command", 32, 32], ["slash", "fx/slash", 32, 32],
      ["smoke", "fx/smoke", 32, 32], ["heal", "fx/heal", 32, 32], ["charge", "fx/charge", 32, 32], ["muzzle", "fx/muzzle", 32, 32],
      ["spark", "fx/hit", 32, 32], ["guard", "fx/guard", 32, 32], ["blaze", "anim/fire_blaze", 32, 48],
      ["join-gate", "fx/join-gate", 64, 64], ["join-dust", "fx/join-dust", 32, 32],
      ["naval-shot", "fx/naval-shot", 32, 32], ["cavalry-dust", "fx/cavalry-dust", 32, 32], ["cavalry-rush", "fx/cavalry-rush", 32, 32],
      ["rampart-thrust", "fx/rampart-thrust", 32, 32], ["staff-sweep", "fx/staff-sweep", 32, 32], ["tablet-toss", "fx/tablet-toss", 32, 32],
      ["tablet-hit", "fx/tablet-hit", 32, 32],
      [ARROW_ART.key, ARROW_ART.file, ARROW_ART.size, ARROW_ART.size]] as const)
      load.spritesheet(key, `${root}art/${file}.png`, { frameWidth: width, frameHeight: height });
    hitFrames.forEach((url, index) => load.image(`hit-frame-${index}`, url));
    this.load.addFile(new StyleFontFile(this.load, "DNFBitBitv2"));
    this.load.on("loaderror", (file: Phaser.Loader.File) => { startFailed(); console.error(`그림 로드 실패: ${file.key}`); });
  }
  private tinted(kind: string, suffix: "white" | "hurt" | "gold" | "ice" | "pouch", frame = UNIT_FRAME): void {
    const image = this.textures.get(kind).getSourceImage() as HTMLImageElement, mask = document.createElement("canvas");
    mask.width = image.width; mask.height = image.height;
    const context = mask.getContext("2d"); if (!context) throw new Error("피격 마스크 생성 실패");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, mask.width, mask.height);
    if (suffix === "white") whitenHitPixels(pixels.data);
    else if (suffix === "gold") recolorAlliedEffectPixels(pixels.data);
    else if (suffix === "ice") chillPixels(pixels.data);
    else if (suffix === "pouch") {
      // Canvas sprites use recolored copies of their existing atlas frames.
      for (let at = 0; at < pixels.data.length; at += 4) {
        if (!pixels.data[at + 3]) continue;
        const light = Math.max(pixels.data[at], pixels.data[at + 1], pixels.data[at + 2]) / 255;
        pixels.data[at] = 92 + 230 * light;
        pixels.data[at + 1] = 64 + 205 * light;
        pixels.data[at + 2] = 11 + 87 * light;
      }
    }
    else recolorPainted(pixels.data, this.painted.source(`hit-masks-${suffix}`), .5);
    context.putImageData(pixels, 0, 0);
    const texture = this.textures.create(`${kind}-${suffix}`, mask, mask.width, mask.height);
    if (!texture) throw new Error(`중복 피격 마스크: ${kind}`);
    this.textures.addSpriteSheet(`${kind}-${suffix}`, texture, { frameWidth: frame.width, frameHeight: frame.height });
  }
  create(): void {
    arenaScene = this;
    if (loadingFailed) return;
    this.painted.prepare(PAINTED_FILES);
    this.wallShield = new WallShield(this, this.painted);
    this.uniqueSkillView = new UniqueSkillView(this, this.painted);
    this.skillStage = new SkillStage(this, this.painted, SKILL_SHOWS, [...CHAOS_SHOWS, unitFx, tacticStrikes]);
    this.tapStrikes = new TapStrikeView(this, (spot, fire) => {
      this.once(spot.x, spot.y - 4, "smoke", "puff", 1, spot.y + 40);
      if (fire) this.once(spot.x, spot.y - 12, "blaze", "blaze", 1, spot.y + 40);
    });
    this.skillStage.shaker = (strength, stop) => this.shake(strength, 0, stop, 200);
    this.skillStage.navalImpact = () => this.navalImpact();
    for (const base of Object.values(GENERAL_ART)) {
      const image = this.textures.get(base).getSourceImage() as HTMLImageElement, canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d"); if (!context) throw new Error("장수 그림 생성 실패");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      personalize(base, pixels.data, canvas.width, this.painted); context.putImageData(pixels, 0, 0);
      this.textures.remove(base);
      const texture = this.textures.create(base, canvas, canvas.width, canvas.height);
      if (!texture) throw new Error("장수 그림 중복");
      this.textures.addSpriteSheet(base, texture, { frameWidth: 32, frameHeight: 32 });
    }
    this.tinted("ladder", "white");
    this.tinted("ladder", "ice");
    for (const [slug, parts] of Object.entries({
      "gore-chips": [[3,2,8,10],[13,8,9,10],[4,14,8,9]],
      "hurt-chips": [[12,2,9,10],[2,5,8,9],[12,14,10,9]],
      "wall-debris": [[10,2,12,13],[2,11,8,10],[13,16,9,7]],
      "keep-debris": [[11,2,12,12],[2,10,9,10],[12,15,11,8]],
    })) parts.forEach(([x,y,width,height], index) => this.textures.get(`painted:${slug}`).add(`piece-${index}`, 0, x, y, width, height));
    for (const kind of foeTextures) { this.tinted(kind, "white"); this.tinted(kind, "ice"); this.tinted(kind, "pouch"); }
    for (const kind of SHIP_TEXTURES) this.tinted(kind, "white", SHIP_FRAME);
    for (const actor of FULL_ENEMY_ART) this.tinted(`boss-sheet-${actor}`, "white", fullsetArt(actor).frame);
    for (const kind of ownTextures) this.tinted(kind, "hurt");
    this.tinted("blast", "gold", { width: 64, height: 64 });
    this.tinted("boom", "gold");
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
    // Shot tails stay above every combat effect but under the enemy warnings.
    this.shotTails = this.add.graphics().setDepth(LAYER.bars - .75);
    this.aimRing = this.add.graphics().setDepth(LAYER.ground + 1);
    this.alarm = this.add.graphics().setDepth(LAYER.alarm); this.rain = this.add.graphics().setDepth(LAYER.weather);
    this.emphasis = new BossCamera(this, () => !attract && feedbackChannels(saved.motionOff, saved.flashesOff, calm).motion);
    this.goldHud = this.add.graphics().setDepth(LAYER.bars);
    this.emphasis.fixed(this.goldHud);
    const strip = (key: string, texture: string, end: number, frameRate: number, repeat = 0) =>
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(texture, { start: 0, end }), frameRate, repeat });
    strip("explosion", "blast", 5, 20); strip("boom", "boom", 4, 20); strip("fallen", "death", 3, 18);
    // The deck cannon's shell: the lone 7 px iron ball of the drawn explosion sheet's last cell (fx/blast.png), not a code drawing.
    this.textures.get("boom").add("naval-shell", 0, 130, 7, 7, 7);
    strip("explosion-gold", "blast-gold", 5, 20); strip("boom-gold", "boom-gold", 4, 20);
    strip("command-flash", "command", 3, 16); strip("slash", "slash", 3, 26); strip("puff", "smoke", 3, 12); strip("mend", "heal", 3, 12); strip("rocket-flight", "rocket", 2, 12, -1);
    strip("miniboss-spin", "slash", 3, 12);
    strip("gate-light", "join-gate", 7, 16); strip("gate-dust", "join-dust", 5, 14);
    // Each of these generals has his own reach picture, so the effect alone tells who struck (owner DM 1794968996): 이순신's cannon
    // shot and bow wave, 신립's charge wedge and hoof dust, 김시민's sword thrust, 사명대사's staff sweep.
    strip("naval-shot", "naval-shot", 3, 16); strip("cavalry-dust", "cavalry-dust", 5, 12); strip("cavalry-rush", "cavalry-rush", 3, 18);
    strip("rampart-thrust", "rampart-thrust", 3, 14); strip("staff-sweep", "staff-sweep", 3, 14);
    // 송상현 throws his wooden tablet (owner DM 1794964237; four frames, DM 1794990058): the frames stand an eighth of a turn apart
    // and the board looks the same after half a turn, so the loop reads as one end-over-end tumble for as long as it flies.
    strip("tablet-toss", "tablet-toss", 3, 14, -1);
    strip("tablet-hit", "tablet-hit", 3, 20);
    const cut = document.createElement("canvas"), slash = this.textures.get("slash").getSourceImage() as HTMLImageElement;
    cut.width = slash.width; cut.height = slash.height;
    const cutContext = cut.getContext("2d");
    if (!cutContext) throw new Error("참격 그림 생성 실패");
    cutContext.drawImage(slash, 0, 0);
    const cutPixels = cutContext.getImageData(0, 0, cut.width, cut.height);
    recolorPainted(cutPixels.data, this.painted.source("hit-masks-white"), 1, at =>
      cutPixels.data[at] + cutPixels.data[at + 1] + cutPixels.data[at + 2] >= 200);
    cutContext.putImageData(cutPixels, 0, 0);
    const cutTexture = this.textures.create("melee", cut, cut.width, cut.height);
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
      // A general's skill fires only from his portrait button, never from a tap on the field (owner DM 1794902302.558399).
      const point = this.cameras.main.getWorldPoint(p.x, p.y);
      // Survival never opens the classic building panel: a standing building answers its own tap,
      // open ground calls the tap strike, and a tap on a general fires nothing (portrait only).
      if (run.bph) {
        const building = bphCastleBuildingAt(run.bph.upgrades, point);
        if (building) { if (run.phase === "playing") tapBphBuilding(building); return; }
        // A finger aims while it drags and fires on release; a mouse already showed the ring and fires on the click.
        if (p.wasTouch) { this.aim.touch(point); return; }
        if (tapBphStrike(run, point)) playSfx("volley");
        return;
      }
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
      // Open ground: buildings above always win the tap; a tap on a general fires nothing (portrait only).
      if (tapBphStrike(run, point)) playSfx("volley");
    });
    // Tap-strike aim (owner DM 1794909654.988639): display and input only, the volley lands where tapBphStrike is called.
    const field = this.game.canvas;
    const overField = (p: Phaser.Input.Pointer): boolean => {
      const rect = field.getBoundingClientRect();
      return document.elementFromPoint(rect.left + p.x / WIDTH * rect.width, rect.top + p.y / HEIGHT * rect.height) === field;
    };
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const point = this.cameras.main.getWorldPoint(p.x, p.y), at = { x: point.x, y: point.y };
      if (p.wasTouch) this.aim.drag(at, WIDTH / field.getBoundingClientRect().width);
      else this.aim.hover(overField(p) ? at : null);
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) return;
      const shot = this.aim.release();
      this.aimRing.clear();
      if (!shot || !run?.bph || paused || attract || !overField(p) || bphCastleBuildingAt(run.bph.upgrades, shot)) return;
      if (tapBphStrike(run, shot)) playSfx("volley");
    });
    field.addEventListener("touchcancel", () => {
      this.aim.cancel();
      this.aimRing.clear();
    }, { capture: true, passive: true });
    this.input.on("gameout", () => this.aim.hover(null));
    document.addEventListener("pointermove", event => {
      if (event.pointerType === "mouse" && event.target !== field) this.aim.hover(null);
    }, { passive: true });
    app.classList.remove("loading");
    element("start-loading").hidden = true;
    title();
    startReady();
    analytics?.ready();
    void preloadAllArt();
    if (!queuedStart) announceBphRelics();
    if (queuedStart) { const general = queuedStart; queuedStart = null; start(general); }
  }
  private reset(): void {
    this.serial = runSerial;
    this.emphasis.reset();
    this.damageNumbers.clear();
    this.skillStage?.clear(); this.tapStrikes?.clear(); this.aim.cancel(); this.aimed = ""; this.held.clear();
    this.numberSprites.forEach(sprite => sprite.setVisible(false));
    for (const coin of this.coins) { this.tweens.killTweensOf(coin); const label = coin.getData("label"); if (label instanceof Phaser.GameObjects.Text) label.destroy(); coin.destroy(); }
    for (const pooled of this.coinPool) { pooled.coin.destroy(); pooled.amount.destroy(); }
    this.coinPool.length = 0;
    this.goldShown = 0; this.goldUntil = 0;
    this.entered.clear();
    if (run && !attract) run.squads.forEach((_, id) => this.entered.set(id, this.time.now));
    for (const sprite of this.foes.values()) sprite.destroy();
    for (const sprite of this.missiles.values()) sprite.destroy();
    this.foes.clear(); this.missiles.clear(); this.strides.clear(); this.turns.clear(); this.bossEntries.clear();
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
    troop.leader.sprite.destroy(); troop.troopers.forEach(trooper => { trooper.sprite.destroy(); trooper.prism?.destroy(); });
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
  /** `reach` sprites draw a general's levelled reach (GENERAL_REACH): the scene renders contact sparks before swings, so in a big
   *  crowd those sparks fill the particle cap first and a Lv20 reach would vanish exactly when it hits most. Reach sprites skip the
   *  particle cap and are bounded by the sprite budget alone. */
  private once(x: number, y: number, texture: string, animation: string, scale = 1, depth = 720, reach = false): Phaser.GameObjects.Sprite | undefined {
    if ((!reach && !this.particles.grant(1, 1)) || !this.decoration.acquire("sprite")) return;
    const sprite = this.add.sprite(x, y, texture).setScale(Math.max(1, Math.round(scale))).setDepth(LAYER.impact + Math.max(0, Math.min(99, depth - 700))).play(animation);
    if (!reach) this.particles.live++;
    sprite.once("destroy", () => { if (!reach) this.particles.live--; this.decoration.release("sprite"); });
    sprite.once("animationcomplete", () => sprite.destroy());
    return sprite;
  }
  /** A general's line reach, drawn from the struck enemy (황진 two cut streaks, one per cut) or from the general (신립's hoof dust,
   *  이순신's cannon shots) out to the reach's length, as thick as its width, stepping outward. */
  private reachOut(from: Point, to: Point, reach: Reach): void {
    const gap = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y)), ux = (to.x - from.x) / gap, uy = (to.y - from.y) / gap, aim = Math.atan2(uy, ux);
    const streak = reach.shape === "streak", trail = reach.shape === "trail", start = streak ? gap : 0, end = gap + reach.length;
    // Dust clouds and cannon shots grow with the reach's width and step further apart as they grow, so at Lv20 they still read as
    // separate clouds and shots; `pace` (ms per px) keeps each line running outward as fast as it did before.
    const size = streak ? .5 + reach.width / 16 : trail ? reach.width / 12 : .6 + reach.width / 15;
    const step = streak ? 14 : trail ? 13 * size : 17 * size, pace = streak ? 12 / 14 : trail ? 1 : 12 / 22;
    const side = streak ? (this.streakSide = -this.streakSide) * 3 : 0;
    for (let along = start + step / 2, order = 0; along <= end; along += step, order++) {
      const x = from.x + ux * along - uy * side, y = from.y + uy * along + ux * side;
      this.time.delayedCall(order * step * pace, () => {
        const sprite = streak ? this.once(x, y - 4, "melee", "melee", 1, 720, true)?.setScale(size).setAlpha(.9).setRotation(aim)
          : trail ? this.once(x, y + (order % 2 ? 0 : 3), "cavalry-dust", "cavalry-dust", 1, 720, true)?.setScale(size).setFlipX(order % 2 === 1)
          : this.once(x, y - 6, "naval-shot", "naval-shot", 1, 720, true)?.setScale(size).setRotation(aim);
        // Dust rises round the feet it passes, sorted with the bodies; the cut streak and the cannon shots cross over the bodies they
        // run through so a crowd cannot hide them.
        sprite?.setDepth(trail ? bodyDepth(y + 3) : LAYER.impact + 10);
        if (sprite && streak) sprite.anims.timeScale = .5;
      });
    }
  }
  /** Ordinary contact, shared by every fighter: below bodies, never a skill-sized overlay. */
  private melee(x: number, y: number, left: boolean): void {
    this.once(x, y - 4, "melee", "melee")?.setScale(.5).setAlpha(.65).setFlipX(left).setDepth(LAYER.ground + 1);
  }
  private buildFort(level: number, gates: readonly Direction[]): void {
    this.wallShield.clear();
    this.fortParts.forEach(part => part.destroy()); this.fortParts = []; this.wallTiles = []; this.gateTiles = []; this.wallWeapons = []; this.builtFort = level; this.builtGates = gates.length;
    const [columns, rows] = FORT_TILES[level], { left, top } = fortGroundRect(level);
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
      // Owner DM 1794899184.599879: a gate in every wall. North and south show the same gatehouse; the east and west gates are a
      // side-wall tile whose opening faces the courtyard, the wall running on unbroken either side. Each follows the wall tier.
      const middle = column === (columns - 1) / 2, level2 = (rows - 1) / 2;
      const sideGate = row === level2 && (column === 0 && gates.includes("좌") || column === columns - 1 && gates.includes("우"));
      const face = sideGate ? column === 0 ? "-w" : "-e" : "";
      const isGate = sideGate || row === rows - 1 && middle && gates.includes("아래") || row === 0 && middle && gates.includes("위");
      const x = left + column * TILE, y = top + (row + 1) * TILE;
      const image = this.add.image(x, y, isGate ? gateTexture(this.wallTier, face) : bphWallTexture(this.wallTier, shape, 0)).setOrigin(0, 1).setDepth(bodyDepth(y - 6));
      this.wallShield.add(image);
      this.fortParts.push(image);
      if (isGate) this.gateTiles.push({ image, face, side: sideGate ? column === 0 ? "좌" : "우" : row === 0 ? "위" : "아래" });
      else this.wallTiles.push({ image, shape, stage: 0, x: x + TILE / 2, y: y - TILE / 2, struckAt: -1000 });
    }
    const places = buildings();
    const raise = (key: string, x: number, y: number, behind = 4) => {
      const image = this.add.image(x, y, key).setOrigin(.5, 1).setDepth(bodyDepth(y - behind)); this.fortParts.push(image); return image;
    };
    // The command building (also the barracks) is drawn at 1x like the shrine and smithy, in its own colours; syncKeep swaps it by wall tier.
    const tent = raise(`core-${this.wallTier}`, places.base.x, places.base.y);
    const flames = [-12, 10, -2].map((dx, i) => this.add.sprite(places.base.x + dx, places.base.y - 10 - i * 8, "blaze").setDepth(bodyDepth(places.base.y - 2)).setScale(.8 + i * .15).play({ key: "blaze", repeat: -1, startFrame: i * 2 }).setVisible(false));
    this.fortParts.push(...flames);
    this.keep = { tent, flames, stage: 0, smokeAt: 0 };
    const hall = raise("yard-hall", places.infirmary.x, places.infirmary.y);
    this.yard = { hall, forge: raise("yard-forge0", places.forge.x, places.forge.y), smokeAt: 0, struckAt: -1e9 };
    for (const slot of weaponSlots(level)) {
      const sprite = this.add.sprite(slot.x, slot.y - WALL_LIFT, slot.kind === "arrow" ? "archer" : "hwacha", 0).setFlipX(slot.x < CENTER.x).setDepth(bodyDepth(fortRect(level).bottom + TILE));
      this.fortParts.push(sprite); this.wallWeapons.push({ kind: slot.kind, sprite, slot });
    }
  }
  private shake(strength = .004, flash = 0, stop = 0, glow = 180): void {
    if (attract) return;
    const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
    const cameraEvents = this.impactBudget.cameraEvents;
    const major = stop >= 70, impact = this.impactBudget.request(this.time.now, major, !channels.motion, strength, glow);
    if (impact.allowed) playSfx(major ? "drum" : "impact");
    if (impact.stop > 0) {
      this.hitStopUntil = Math.max(this.hitStopUntil, this.time.now + impact.stop); feedback.hitStops.push(impact.stop);
      feedback.hitStopEvents.push({ at: this.time.now, ms: impact.stop });
    }
    feedback.shakes += this.impactBudget.cameraEvents - cameraEvents;
    if (!flash || !channels.flash) return;
    feedback.screenFlashes++; feedback.viewportFlashes++;
    const veil = element("screen-flash");
    veil.getAnimations().forEach(animation => animation.cancel());
    veil.hidden = false;
    veil.animate([{ opacity: Math.min(.7, flash) }, { opacity: 0 }], { duration: 80 }).onfinish = () => { veil.hidden = true; };
  }
  private navalImpact(): void {
    if (attract) return;
    const { motion } = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
    if (this.impactBudget.big(this.time.now, !motion)) feedback.shakes++;
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
  dismissAim(): void {
    this.aim.dismissRing();
    this.aimRing.clear();
  }
  /** The tap strike's exact landing circle at the aim point: one 2px friendly-teal line over a barely-there fill (owner DM 1794910194.172529,
   *  the painted range art read as a double ring); red stays for enemy warnings. Faint while no volley is ready. */
  private drawAim(current: Run): void {
    this.aimRing.clear();
    // Drawn tactics are the cursor while they last (owner DMs 1794920233.660669, 1794920906.443119, 1794922243.201739): they all act
    // where the player points, sent to the battle as aim events, and the same single teal ring shows the largest reach.
    const tactic = bphTacticCursor(current), pointing = this.aim.pointing;
    const aimAt = tactic && current.bph && current.phase === "playing" && pointing &&
      !bphCastleBuildingAt(current.bph.upgrades, pointing) ? pointing : null;
    const aimKey = aimAt ? `${Math.round(aimAt.x)},${Math.round(aimAt.y)}` : "";
    if (aimKey !== this.aimed) { this.aimed = aimKey; aimBphTactic(current, aimAt); }
    const point = tactic ? aimAt : this.aim.ring, strike = bphTapStrike(current);
    if (!point || !strike || !current.bph || current.phase !== "playing" || bphCastleBuildingAt(current.bph.upgrades, point)) return;
    const alpha = tactic || strike.charges > 0 ? 1 : .3, radius = tactic?.radius ?? strike.radius;
    this.aimRing.fillStyle(PALETTE.ally, .08 * alpha).fillCircle(point.x, point.y, radius)
      .lineStyle(2, PALETTE.ally, .9 * alpha).strokeCircle(point.x, point.y, radius - 1);
  }
  private range(x: number, y: number, radius: number): void {
    if (!this.decoration.allow("range", this.time.now, 3)) return;
    const mark = this.add.graphics().setDepth(LAYER.ground);
    paintedRange(mark, this.painted, "range-friendly", x, y, radius, .3);
    feedback.rings++;
    this.tweens.add({ targets: mark, alpha: 0, duration: 400, onComplete: () => mark.destroy() });
  }
  /** An explosion's picture, display only (owner DM 1794901133, 1794901160). BPH spell blasts (the fire cart's fire arrow, mines, light beam)
   *  carry their hit radius in px while rules blasts carry radius / 26, so the old `clamp(value, 1, 3)` drew every fire arrow, foil or not, at x3:
   *  a 192 px sheet whose dark smoke frames buried the units. The picture is now at most 40% of that old size and never wider than the hit
   *  circle, half opaque, played twice as fast, and at most four stay on screen (the oldest goes first). */
  private blast(effect: Effect): void {
    const pixels = effect.value > 8; // rules values stay under ~6 (78 px * 1.24 / 26); BPH spell radii are 0 or at least 16 px
    const hit = pixels ? effect.value : effect.value * 26, big = pixels || effect.value >= 1.4;
    const before = (big ? 64 : 32) * Math.round(Math.max(1, Math.min(3, effect.value)));
    const room = Math.min(before * .4, hit * 2);
    const look = BLAST_LOOKS.find(option => option.width <= room) ?? (hit * 2 >= 16 ? BLAST_LOOKS[BLAST_LOOKS.length - 1] : undefined);
    feedback.chains++;
    if (!look) return;
    const tone = effect.hostile ? "" : "-gold";
    const sprite = this.once(effect.x, effect.y - 4, look.texture + tone, look.animation + tone, 1, 718);
    if (sprite) {
      sprite.setScale(look.scale).setAlpha(.5).anims.timeScale = 2;
      this.blasts.push(sprite);
      sprite.once("destroy", () => { this.blasts = this.blasts.filter(other => other !== sprite); });
      while (this.blasts.length > 4) this.blasts[0].destroy();
    }
    feedback.largestBlastScale = Math.max(feedback.largestBlastScale, look.width / 64);
    if (big && hit * 2 >= 32) this.scorch(effect.x, effect.y);
  }
  /** A deck-cannon shell's burst with cbe4240's reduced explosion looks (owner DM 1794901133, 1794901160): the largest drawn explosion
   *  inside the hit circle, half opaque, played twice as fast. cbe4240's 40% cut aimed at the x3 fire-arrow sheet; on an 18 px shell it
   *  left a 16 px half-opaque puff that did not read on a phone, so the shell keeps only the hit-circle cap (32 px). */
  private navalBlast(effect: Effect): void {
    const room = effect.value * 26 * 2;
    const looks = [{ texture: "blast", animation: "explosion", scale: 1, width: 64 }, { texture: "boom", animation: "boom", scale: 1, width: 32 },
      { texture: "boom", animation: "boom", scale: .5, width: 16 }] as const;
    const look = looks.find(option => option.width <= room) ?? looks[looks.length - 1];
    feedback.chains++;
    const sprite = this.once(effect.x, effect.y - 4, `${look.texture}-gold`, `${look.animation}-gold`, 1, 718);
    if (sprite) { sprite.setScale(look.scale).setAlpha(.5); sprite.anims.timeScale = 2; }
  }
  private scorch(x: number, y: number): void {
    if (!this.decoration.acquire("scorch")) return;
    const mark = this.add.image(x, y, "scorch").setDepth(6).setAlpha(.35);
    mark.once("destroy", () => this.decoration.release("scorch"));
    this.tweens.add({ targets: mark, alpha: 0, delay: 1300, duration: 450, onComplete: () => mark.destroy() });
  }

  /** A survival join's arrival, display only: as the general reaches the south gate (60% of his run out of the hall) the gate's golden light
   *  bursts once behind him at 1x pixel scale (the approved gate sheet, never the enlarged command fan the owner rejected, DM 1794887962),
   *  gate dust rises either side, the yard's ally flag waves and hops either side of it, and the generals already in the field flash their
   *  command mark. The light needs motion and flashes; reduced motion keeps only still flags. */
  private gateFanfare(current: Run, joined: number | undefined): void {
    const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm), gx = CENTER.x, gy = fortRect(current.fort).bottom;
    const depth = bodyDepth(gy - 6) + 1;
    this.time.delayedCall(ENTRANCE_MS * .6 - 120, () => {
      // The rays rise from the doorway (the sheet's light sits on row 54 of 64) just over the gate stone, starting as the general reaches
      // the gate so he walks out in front of them (his depth passes the gate's on his first steps south).
      if (channels.motion && channels.flash) this.time.delayedCall(120, () =>
        this.once(gx, gy, "join-gate", "gate-light")?.setOrigin(.5, 54 / 64).setDepth(bodyDepth(gy - 6) + .01));
      if (channels.motion) for (const side of [-1, 1]) {
        this.once(gx + side * 11, gy - 2, "join-dust", "gate-dust", 1, depth + 2)?.setFlipX(side < 0);
        this.once(gx + side * 6, gy + 4, "join-dust", "gate-dust", 1, depth + 2)?.setFlipX(side > 0).setAlpha(.7);
      }
      for (const [index, mate] of current.squads.entries()) if (index !== joined && fielded(mate)) {
        const at = this.positions.get(mate) ?? mate;
        if (channels.motion) this.once(at.x, at.y - 18, "command", "command-flash", 1, bodyDepth(at.y) + 4);
      }
      // Two ally flags either side of the gate: they plant, wave and hop twice, then lower.
      for (const side of [-1, 1]) {
        const flag = this.add.image(gx + side * 30, gy + 26, "yard-flag0").setOrigin(8 / 32, 31 / 32).setFlipX(side < 0).setDepth(bodyDepth(gy + 26));
        if (!channels.motion) { this.tweens.add({ targets: flag, alpha: 0, delay: 1300, duration: 300, onComplete: () => flag.destroy() }); continue; }
        flag.setAlpha(0);
        this.tweens.add({ targets: flag, alpha: 1, duration: 120, ease: "Stepped", easeParams: [2] });
        this.tweens.add({ targets: flag, y: gy + 23, delay: 160, duration: 140, yoyo: true, repeat: 1, ease: "Stepped", easeParams: [2] });
        const wave = this.time.addEvent({ delay: 130, repeat: 10, callback: () => flag.setTexture(`yard-flag${wave.getRepeatCount() % 2}`) });
        this.tweens.add({ targets: flag, alpha: 0, delay: 1400, duration: 240, ease: "Stepped", easeParams: [3], onComplete: () => { wave.remove(); flag.destroy(); } });
      }
    });
  }
  private trooperOf(effect: Effect): Trooper | undefined {
    const troop = effect.squad === undefined ? undefined : this.troops[effect.squad];
    return effect.index === undefined ? undefined : effect.index < 0 ? troop?.leader : troop?.troopers[effect.index];
  }
  /** The rules resolve a skill on its cast tick. With motion on, a staged skill's own results wait in its show until its picture lands and then join that frame's effects. */
  private stage(batch: Effect[], current: Run, motion: boolean, delta: number, cssPixel: number): Effect[] {
    const waiting = new Set<Effect>();
    batch.forEach((effect, index) => {
      if (effect.kind === "skill") for (const item of castResults(batch, index))
        if (item.kind === "hit") skillHits.set(item, skillVfx(current, current.squads[effect.squad ?? 0]));
    });
    batch.forEach((effect, index) => {
      const show = effect.kind === "skill" ? this.skillStage?.staged(current.squads[effect.squad ?? -1]?.general, effect) : undefined;
      const waits = show?.waits;
      if (!waits) return;
      const results = motion ? castResults(batch, index).filter(item => !waiting.has(item) && batch.includes(item) && waits(item)) : [];
      for (const item of results) waiting.add(item);
      if (current.squads[effect.squad ?? -1]?.general === "이순신") {
        // Register this cast before same-frame ordinary hits can overtake its unseen damage.
        this.castSkill(effect, current, results);
      } else this.held.set(effect, results);
    });
    const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
    for (const item of this.skillStage?.holdFleet(batch.filter(item => !waiting.has(item)), current, channels) ?? []) waiting.add(item);
    for (const item of this.skillStage?.holdFollowing(batch.filter(item => !waiting.has(item)), channels) ?? []) waiting.add(item);
    const { shown } = holdBack(batch, waiting);
    const landed = this.skillStage?.update(delta, { cssPixel, run: current, at: unit => this.positions.get(unit) ?? unit, foe: id => this.foes.get(id), band: bannerBox(this.game.canvas, cssPixel),
      channels: feedbackChannels(saved.motionOff, saved.flashesOff, calm) }) ?? [];
    this.tapStrikes?.update(this.time.now);
    this.drawAim(current);
    return landed.length ? [...shown, ...landed] : shown;
  }
  private castSkill(effect: Effect, current: Run, results: readonly Effect[]): void {
    const squad = current.squads[effect.squad ?? 0];
    const tier = Math.max(growthTier(current.level), squad.tier, growthFor(squad.general, current).tier);
    this.skillStage?.cast(squad.general, { skill: effect, results, run: current, squad, from: this.positions.get(squad) ?? squad, tier,
      channels: feedbackChannels(saved.motionOff, saved.flashesOff, calm), density: this.particles.headroom() }, id => this.foes.get(id));
  }
  private skill(effect: Effect, current: Run): void {
    const squad = current.squads[effect.squad ?? 0];
    const tier = Math.max(growthTier(current.level), squad.tier, growthFor(squad.general, current).tier);
    const look = skillVfx(current, squad), scale = 1 + (tier - 1) * .25;
    feedback.skillBursts++;
    feedback.largestSkillScale = Math.max(feedback.largestSkillScale, scale);
    if (feedbackChannels(saved.motionOff, saved.flashesOff, calm).motion)
      this.once(squad.x, squad.y - 14, "command", "command-flash", 2 * scale, 760)?.setAlpha(look.alpha);

    const stage = this.skillStage, show = stage?.staged(squad.general, effect);
    if (stage && show) {
      // Turtle casts already registered in stage(), before following hits. Other shows retain their normal start.
      if (squad.general !== "이순신") this.castSkill(effect, current, this.held.get(effect) ?? []);
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
      this.shake(look.heavy ? .008 : 0, 0, 90, 200);
    } else if (squad.general === "송상현" || squad.general === "곽재우"
      || current.chaosSkills?.events.some(event => event.kind === "ships" && event.squad === squad.id)) {
      // Persistent attacks and the multi-directional fleet are drawn from simulation state.
      return;
    } else {
      this.burst(effect.x, effect.y, 1.3 * scale, "evolution");
      this.range(effect.x, effect.y, effect.value);
      this.shake(look.heavy ? .01 : 0, 0, 90);
    }
  }
  private show(effect: Effect, current: Run): void {
    const now = this.time.now, striker = this.trooperOf(effect);
    if (effect.kind === "boss-enter") {
      if (effect.target !== undefined) this.bossEntries.set(effect.target, now);
      feedback.bossEntrances++;
      // Screen-fixed over the camera view. The crop is the fill's flat 8..21 pixels (no bevel, border or
      // transparent edge), and the overscan keeps the edges covered under the boss zoom accent.
      const view = this.cameras.main, over = .03;
      const veil = this.add.graphics().setDepth(LAYER.veil).setAlpha(calm ? .25 : .6).setScrollFactor(0);
      this.painted.draw(veil, "boss-entry-veil-fill", -view.width * over, -view.height * over,
        { width: view.width * (1 + 2 * over), height: view.height * (1 + 2 * over), source: { x: 8, y: 8, width: 14, height: 14 } });
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
    } else if (effect.kind === "windup" && striker && effect.mechanism !== "special") {
      striker.windFor = effect.value * 1000; striker.aimX = effect.x; striker.aimY = effect.y; feedback.windups++;
    } else if (effect.kind === "swing") {
      const from = { x: effect.fromX ?? effect.x, y: effect.fromY ?? effect.y }, left = effect.x < from.x;
      // pose() already plays the striker's contact frame and lunge. The blade/staff generals' patterns (GENERAL_STRIKE) show where
      // their blows land: 신립's charge wedge, 김시민's thrusts fanned across the front, 사명대사's staff sweeps round him.
      const aim = Math.atan2(effect.y - from.y, effect.x - from.x);
      // How far the pattern reaches grows with the general's level (GENERAL_REACH, owner DM 1794966115): more and larger cuts.
      const owner = effect.index === -1 ? current.squads[effect.squad ?? 0] : undefined;
      const reach = owner ? generalReach(owner.general, reachLevel(current)) : undefined;
      // 김시민's thrusts point out along the fan's spokes at once; 사명대사's sweeps lie along the ring and follow each other round
      // it, so at any level the two read as spikes against a wheel.
      const ring = (texture: "rampart-thrust" | "staff-sweep", turns: readonly number[], radius: number, scale: number) => turns.forEach((turn, order) => {
        const angle = aim + turn, sweep = texture === "staff-sweep";
        this.time.delayedCall(sweep ? order * 14 : 0, () =>
          this.once(from.x + Math.cos(angle) * radius, from.y + Math.sin(angle) * radius - 4, texture, texture, 1, 720, true)?.setScale(scale)
            .setRotation(sweep ? angle + Math.PI / 2 : angle).setDepth(LAYER.impact + 10));
      });
      if (effect.label === "lunge") this.once(from.x, from.y, "cavalry-rush", "cavalry-rush", 2, 750)?.setRotation(aim);
      if (effect.label === "lunge" && reach) this.reachOut(from, effect, reach);
      if (effect.label === "sweep" && reach) {
        const cuts = 3 + Math.round((reach.width - 60) / 12), spread = (reach.width - 15) * Math.PI / 180;
        ring("rampart-thrust", Array.from({ length: cuts }, (_, cut) => -spread + 2 * spread * cut / (cuts - 1)), reach.length * .7, .6 + reach.length / 120);
      } else if (effect.label === "spin" && reach) {
        const cuts = Math.round(4 + (reach.length - 30) / 70 * 6);
        ring("staff-sweep", Array.from({ length: cuts }, (_, cut) => 2 * Math.PI * cut / cuts), reach.length * .75, .7 + reach.length / 150);
      } else {
        this.melee(effect.x, effect.y, left);
        if ((effect.label === "combo" || effect.label === "lance") && reach) this.reachOut(from, effect, reach);
      }
      feedback.strikeFrames++;
      feedback.swings++; feedback.hitFrames++;
    } else if (effect.kind === "shot") {
      const from = { x: effect.fromX ?? effect.x, y: effect.fromY ?? effect.y };
      const gunner = effect.index === undefined ? undefined : current.squads[effect.squad ?? -1]?.soldiers[effect.index];
      const chongtong = effect.by === "hwacha" && gunner?.bph?.profileId === "Hero6_BloodMage";
      if (chongtong) this.skillStage?.chongtongFire(from, Math.atan2(effect.y - from.y, effect.x - from.x),
        feedbackChannels(saved.motionOff, saved.flashesOff, calm));
      else if (effect.by === "hwacha") this.once(from.x, from.y - WALL_LIFT - 4, "smoke", "puff", 1, from.y + 60);
      // A cursor-tactic 뇌격 bolt (label "bolt"): the thunderstorm stroke itself, not a smoke puff (owner DM 1794922729.289679).
      if (effect.label === "bolt") tacticStrikes.bolt(effect.x, effect.y, effect.value);
      if (effect.hostile) {
        this.once(from.x, from.y - 4, "muzzle", "muzzle", 1, 716)?.setFlipX(effect.x < from.x);
        if (effect.minor) this.tracer(from, effect);
      } else if (!chongtong && !effect.label && effect.value >= 1) this.once(from.x, from.y - 6, "smoke", "puff", 1, 716);
      const owner = effect.label === "lance" ? current.squads[effect.squad ?? 0] : undefined;
      const lance = owner && generalReach(owner.general, reachLevel(current));
      if (lance) this.reachOut(from, effect, lance);
    } else if (effect.kind === "blast" && effect.by === "panokseon") {
      this.navalBlast(effect);
    } else if (effect.kind === "blast") {
      // A cursor-tactic 지진 (label "quake") keeps its reduced explosion picture and adds the stomp shockwave out to the real
      // radius, so the ring the aim circle promised is shown (owner DM 1794922729.289679).
      if (effect.label === "quake") tacticStrikes.quake(effect.x, effect.y, effect.value);
      this.blast(effect);
    } else if (effect.kind === "devastate") {
      feedback.bigCrits++;
    } else if (effect.kind === "kill") {
      const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
      // syncFoes owns the one death response, including kills omitted by the decoration rate cap.
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
      if (effect.label === "militia-momentum") {
        for (const [squadIndex, squad] of current.squads.entries()) {
          const index = squad.soldiers.findIndex(unit =>
            unit.bph?.profileId === "Hero1_Barbarian" && unit.x === effect.x && unit.y === effect.y);
          const unit = squad.soldiers[index], troop = this.troops[squadIndex]?.troopers[index];
          if (!unit || !troop) continue;
          const head = spriteHealthAnchor(troop.sprite), count = nearbyMilitia(current, unit);
          const width = Math.max(11, count * 3 + 2);
          const badge = this.add.graphics().setName("militia-momentum").setDepth(LAYER.bars + 1)
            .setPosition(Math.round(head.x) - Math.floor(width / 2), Math.round(head.y) - 22);
          badge.fillStyle(PALETTE.outline).fillRoundedRect(0, 0, width, 11, 2)
            .lineStyle(2, 0x8bf0d7).beginPath()
            .moveTo(width / 2 - 3, 5).lineTo(width / 2, 2).lineTo(width / 2 + 3, 5).strokePath()
            .fillStyle(0x8bf0d7);
          for (let pip = 0; pip < count; pip++) badge.fillRect(Math.floor((width - count * 3 + 1) / 2) + pip * 3, 7, 2, 2);
          this.tweens.add({ targets: badge, alpha: 0, delay: 280, duration: 160, onComplete: () => badge.destroy() });
          break;
        }
      } else {
        if (effect.squad !== undefined) this.entered.set(effect.squad, this.time.now);
        this.once(effect.x, effect.y, "heal", "mend", 2, 763);
      }
    } else if (effect.kind === "strike") {
      this.tapStrikes?.launch(effect, now, !feedbackChannels(saved.motionOff, saved.flashesOff, calm).motion);
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
      if (effect.miniboss) {
        const fromX = effect.fromX ?? effect.x, fromY = effect.fromY ?? effect.y;
        const { motion } = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
        if (effect.miniboss === "shield") return; // The raised shield and its aura follow the enemy in syncFoes.
        if (effect.minor) {
          this.once(effect.x, effect.y + 13, "guard", "ward", 1, 764);
        } else if (effect.miniboss === "spin-slash") {
          const slash = this.once(fromX, fromY + 15, "slash", "miniboss-spin", 1, 764)?.setScale(1.35);
          if (slash && motion) {
            slash.setAngle(-45);
            this.tweens.add({ targets: slash, angle: 315, duration: slash.anims.currentAnim!.duration, ease: "Linear" });
          }
        } else {
          const angle = Phaser.Math.Angle.Between(fromX, fromY, effect.x, effect.y);
          if (effect.miniboss === "salvo") {
            this.once(fromX + Math.cos(angle) * 15, fromY + Math.sin(angle) * 15, "muzzle", "muzzle", 2, 764)?.setRotation(angle);
          } else {
            const rush = this.once(fromX, fromY + 4, "charge", "rush", 1, 764)?.setRotation(angle);
            if (rush && motion) {
              this.tweens.add({ targets: rush, x: effect.x, y: effect.y + 4, duration: rush.anims.currentAnim!.duration, ease: "Linear" });
            }
          }
        }
        return;
      }
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
    } else if (effect.kind === "rift" || effect.kind === "wave" || effect.kind === "expand") {
      const wall = fortRect(current.fort, 34), ring = effect.kind === "wave" ? 12 : 10;
      for (let i = 0; i < ring; i++) this.time.delayedCall(i * 45, () => {
        const along = i / ring * Math.PI * 2;
        const x = CENTER.x + Math.cos(along) * (wall.right - wall.left) * .62, y = CENTER.y + Math.sin(along) * (wall.bottom - wall.top) * .62;
        if (effect.kind === "expand") { this.once(x, y, "smoke", "puff", 2, 740); feedback.smoke++; }
        else this.burst(x, y, 1.3, i % 2 ? "powder" : "flame");
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
      if (effect.value === 1 && current.bph) this.gateFanfare(current, effect.squad);

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
      const recycled = this.coinPool.pop();
      const coin = recycled?.coin ?? this.add.image(effect.x, effect.y, "painted:coin-hud-pixels").setDepth(LAYER.bars + 1);
      const amount = recycled?.amount ?? this.add.text(effect.x + 8, effect.y, `+${effect.value}`, { fontFamily: "DNFBitBitv2", fontSize: "12px",
        color: color(PALETTE.gold), stroke: color(PALETTE.dark), strokeThickness: 2 }).setDepth(LAYER.bars + 2);
      if (!recycled) { this.emphasis.fixed(coin); this.emphasis.fixed(amount); }
      coin.setTexture("painted:coin-hud-pixels").setPosition(effect.x, effect.y).setDisplaySize(side, side).setVisible(true);
      amount.setPosition(effect.x + 8, effect.y).setText(`+${effect.value}`).setVisible(true);
      coin.setData({ born: now, minor: effect.minor, amount: effect.value, label: amount });
      this.coins.add(coin);
      this.tweens.add({ targets: coin, y: effect.y - 10, duration: 100, ease: "Quad.Out",
        onUpdate: () => amount.setPosition(coin.x + 8, coin.y) });
      this.tweens.add({ targets: coin, x: 14, y: 24, delay: 100, duration: 300, ease: "Quad.In",
        onUpdate: () => amount.setPosition(coin.x + 8, coin.y), onComplete: () => {
        const arrival = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
        this.tweens.killTweensOf(coin); this.coins.delete(coin);
        coin.setVisible(false); amount.setVisible(false);
        this.coinPool.push({ coin, amount });
        this.goldUntil = arrival.flash ? this.time.now + 800 : 0;
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
    const gates = fortGates(!!current.bph);
    if (this.builtFort !== current.fort || this.builtGates !== gates.length) this.buildFort(current.fort, gates);
    const tier = bphWallTier(current), retier = tier !== this.wallTier;
    this.wallTier = tier;
    for (const gate of this.gateTiles) {
      if (retier) gate.image.setTexture(gateTexture(tier, gate.face));
      gate.image.setVisible(current.walls[gate.side] > 0);
    }
    this.wallTiles.forEach((tile, index) => {
      const side = sideOf(fortRect(current.fort), tile), hp = current.walls[side], worn = 1 - hp / (current.maxWall / 4);
      const stage = Phaser.Math.Clamp(Math.floor(worn * 4.6 + (index * 7 % 3 - 1) * .3), 0, 3);
      if (stage !== tile.stage) {
        if (stage > tile.stage) this.crumble(tile, 3 + stage * 2);
        tile.stage = stage; tile.image.setTexture(bphWallTexture(tier, tile.shape, stage));
      } else if (retier) tile.image.setTexture(bphWallTexture(tier, tile.shape, stage));
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
    // The core's bar is the units' bar, only wider, on the line the old gauge's fill sat on.
    if (!attract) this.bar(Math.round(CENTER.x) - 28, Math.round(top) - 3, 56, share, "ally");
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
  /** The smithy fire flickers and smokes, flaring for a moment when an upgrade is bought. */
  private syncYard(): void {
    const yard = this.yard, now = this.time.now;
    if (!yard) return;
    // A survival run draws only the buildings its mastery map has raised.
    const standing = run?.bph ? bphCastleStanding(run.bph.upgrades) : null;
    yard.forge.setVisible(standing?.smithy ?? true);
    yard.hall.setVisible(standing?.temple ?? true);
    // A full tactic draw makes the temple bob until it is tapped or collects itself.
    yard.hall.setScale(standing?.temple && run && bphTempleReady(run) ? 1 + .15 * Math.abs(Math.sin(now / 150)) : 1);
    // A survival run opens the smithy through its mastery map; the old meta forge cap gates only the classic run.
    const open = standing ? standing.smithy : run?.meta.caps?.drill !== 0;
    yard.forge.setAlpha(open ? 1 : .3);
    if (!open || calm) return;
    const fire = `yard-forge${now - yard.struckAt < 400 || Math.floor(now / 170) % 2 ? 1 : 0}`;
    if (yard.forge.texture.key !== fire) yard.forge.setTexture(fire);
    if (now < yard.smokeAt || !yard.forge.visible) return;
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
    } else if (stage < keep.stage) keep.tent.setScale(1).setAngle(0);
    const core = `core-${Math.min(this.wallTier, CORE_ART.length - 1)}`;
    if (keep.tent.texture.key !== core) keep.tent.setTexture(core);
    // Damage darkens the building a step at a time (the cracks and fire below carry the rest), so its own colours still show.
    if (stage < 4) keep.tent.setTint(CORE_DAMAGE_SHADE[stage]);
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
  private syncFoes(current: Run, cssPixel: number): void {
    const alive = new Set(current.enemies.map(e => e.id)), now = this.time.now;
    const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
    for (const [id, sprite] of this.foes) if (!alive.has(id)) {
      if (this.skillStage?.holds(id)) {
        // A foe a staged skill has already felled stands until its picture lands, then flashes like any struck body before it falls.
        const white = `${sprite.getData("base")}-white`;
        if (now < Number(sprite.getData("flashUntil") ?? 0) && channels.flash
          && !sprite.getData("fullBoss") && sprite.texture.key !== white) { sprite.anims.pause(); sprite.setTexture(white, sprite.frame.name); }
        const target = this.skillStage.heldTarget(id);
        if (target) {
          // Already untargetable in combat: a still, translucent remnant must not impersonate an active enemy.
          sprite.anims.pause(); sprite.setAlpha(.55);
          const hp = this.skillStage.hp(id, target.hp);
          if (showEnemyHealth({ ...target, hp })) {
            const head = restingHealthAnchor(sprite, this.skillStage.pinned(id) ?? sprite);
            this.health(head.x, head.y, hp / target.maxHp, "enemy");
          }
        }
        continue;
      }
      if (sprite.getData("boss")) this.emphasis.death();
      sprite.anims.stop();
      const art = { base: String(sprite.getData("base")), full: Boolean(sprite.getData("fullBoss")), ship: Boolean(sprite.getData("ship")) };
      const heading = sprite.getData("direction"), direction = heading === "front" ? "front" : heading === "back" ? "back" : "side";
      playEnemyDeath(this, sprite, art, direction, channels, this.decoration);
      this.foes.delete(id); this.strides.delete(id); this.turns.delete(id); feedback.topples++;
    }
    const chilled = bphChilledEnemies(current);
    for (const enemy of current.enemies) {
      const art = enemyArt(enemy), { base, full } = art, big = enemy.boss || enemy.elite;
      const voyage = enemy.cargo ? transportView(enemy) : undefined;
      const { x, y } = this.skillStage?.pinned(enemy.id) ?? voyage ?? this.positions.get(enemy) ?? enemy;
      let sprite = this.foes.get(enemy.id);
      if (!sprite) {
        const idle = enemyAnimation(art, { moving: false, attacking: false, hurt: false, direction: "side", flashing: false }).frames[0];
        sprite = this.add.sprite(enemy.x, enemy.y, idle.key, idle.frame);
        if (full) sprite.setOrigin(.5, 1 - 32 / fullsetArt(base).frame.height);
        sprite.setData("boss", enemy.boss).setData("fullBoss", full).setData("bossArt", enemy.bossArt).setData("base", base).setData("ship", Boolean(art.ship)); this.foes.set(enemy.id, sprite);
      }
      const body = enemyBodyScale(enemy);
      const size = bodyScale(false, enemy.kind === "ukita", big) * body;
      sprite.setAlpha(1);
      const nativeScale = bodyScale(full, enemy.kind === "ukita", big) * body * (enemy.cargo ? TRANSPORT_TIERS[enemy.shipArt ?? "kobaya"].scale : 1);
      sprite.setData("nativeScale", nativeScale).setScale(nativeScale);
      if (enemy.enraged) sprite.setTint(PALETTE.warning); else sprite.clearTint();
      const flashing = channels.flash && (now < Number(sprite.getData("flashUntil") ?? 0) || (enemy.casting > 0 && Math.floor(now / 90) % 2 === 0));
      const texture = flashing ? `${base}-white` : enemy.goldPouch ? `${base}-pouch`
        : chilled.has(enemy.id) && this.textures.exists(`${base}-ice`) ? `${base}-ice` : base;
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
      const facedLeft = walk.faceLeft, turnX = this.turns.get(enemy.id) ?? enemy.x;
      sampleEnemyMotion(walk, enemy, current.time);
      walk.faceLeft = facedLeft;
      if (Math.abs(enemy.x - turnX) >= TURN_DEADBAND.walk) { walk.faceLeft = enemy.x < turnX; this.turns.set(enemy.id, enemy.x); }
      else if (!this.turns.has(enemy.id)) this.turns.set(enemy.id, enemy.x);
      // A transport under sail faces its voyage, not the walk deadband.
      if (voyage) { walk.direction = voyage.direction; walk.faceLeft = voyage.faceLeft; }
      const { moving, direction } = walk, stride = MOTION.stride * size * (enemy.kind === "cavalry" ? 1.5 : 1);
      const step = stepsWalked(walk.gait, stride);
      if (step !== walk.step) { if (walk.step >= 0) feedback.foeSteps++; walk.step = step; }
      const hurt = now - Number(sprite.getData("struckAt") ?? -1e9);
      const squash = hitSquash(hurt, Boolean(sprite.getData("criticalHit")), channels.motion);
      if (!art.full && !art.ship) sprite.setScale(Math.max(nativeScale, sprite.scaleX * squash.x), Math.max(nativeScale, sprite.scaleY * squash.y));
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
      const target = prey ? this.positions.get(prey) ?? prey : (cast?.skill === "shield" && enemy.miniboss ? undefined : cast) ?? {
        x: Number(sprite.getData("aimX") ?? CENTER.x), y: Number(sprite.getData("aimY") ?? CENTER.y),
      };
      const facing = attackFacing({ x, y }, target);
      if (attacking) {
        if (Math.abs(target.x - x) >= TURN_DEADBAND.aim) walk.faceLeft = facing.flipX;
        walk.direction = facing.direction; this.turns.set(enemy.id, enemy.x);
      }
      const poseDirection = attacking ? facing.direction : direction;
      const animation = enemyAnimation(art, { moving, attacking, hurt: hurt < 150, direction: poseDirection, flashing, goldPouch: enemy.goldPouch });
      const samePose = sprite.anims.currentAnim?.key.replace(/-(white|pouch)-/, "-") === animation.key.replace(/-(white|pouch)-/, "-");
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
      const held = channels.motion && now < Number(sprite.getData("hitHoldUntil") ?? 0);
      const recoil = channels.motion && !enemy.boss ? hitRecoil(held ? 0 : hurt, critical) * cssPixel : 0, recoilAngle = Number(sprite.getData("recoilAngle") ?? 0);
      const drop = calm ? 0 : Math.max(0, 1 - (now - (this.bossEntries.get(enemy.id) ?? -1e9)) / 430) ** 2 * 90;
      sprite.setPosition(x + Math.cos(aim) * offset + Math.cos(recoilAngle) * recoil, y + Math.sin(aim) * offset + Math.sin(recoilAngle) * recoil - (moving ? stepHop(walk.gait, stride) * size : 0) - drop)
        .setAngle(striking ? (enemy.x > CENTER.x ? -10 : 10) : moving ? Math.sin(walk.gait / stride * Math.PI) * MOTION.lean : 0)
        .setFlipX(spriteFlipX(base, walk.faceLeft)).setDepth(bodyDepth(y));
      if (held) {
        sprite.setPosition(Number(sprite.getData("holdX")), Number(sprite.getData("holdY")));
        sprite.anims.pause();
      }
      if (enemy.miniboss === "shield") {
        const guarding = cast?.skill === "shield" || enemy.shielded;
        if (guarding) this.guard(sprite.x + (walk.faceLeft ? -12 : 12), sprite.y + 10);
        if (enemy.shielded) {
          // The cooldown begins when the shield reforms. Keep the aura until the shield is spent.
          const spread = channels.motion ? .48 + .52 * Phaser.Math.Clamp((MINIBOSS.cooldown - enemy.skillClock) / .22, 0, 1) : 1;
          const width = 2 * CASTS.shield.radius * spread, height = width * .58;
          this.marks.fillStyle(PALETTE.ally, .17).fillEllipse(x, y + 22, width, height)
            .lineStyle(2, PALETTE.ally, .75).strokeEllipse(x, y + 22, width, height);
        }
      } else if (enemy.shielded) {
        this.guard(x + (sprite.flipX ? -10 : 10), y - 6);
      }
      const hp = this.skillStage?.hp(enemy.id, enemy.hp) ?? enemy.hp;
      const showHealth = showEnemyHealth({ hp, maxHp: enemy.maxHp, boss: enemy.boss || Boolean(enemy.miniboss), elite: enemy.elite });
      if (!showHealth && !enemy.casting) continue;
      const head = restingHealthAnchor(sprite, { x, y: y - drop }), top = head.y;
      if (showHealth) {
        this.health(head.x, top, hp / enemy.maxHp, "enemy");
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
        .fillStyle(PALETTE.danger).fillRect(46, 54, 298 * (this.skillStage?.hp(chief.id, chief.hp) ?? chief.hp) / chief.maxHp, 6);
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
        this.shotTails.save().translateCanvas(Math.round(shot.x), Math.round(shot.y)).rotateCanvas(heading);
        this.painted.draw(this.shotTails, "bullet", -19, -12);
        this.shotTails.restore();
        continue;
      }
      if (shot.kind === "shell") {
        // Lobbed: the rules fly the shell straight; on screen it rises and falls over that line, ending where its mark is drawn.
        const lob = shot.lob ?? { x: shot.x, y: shot.y, height: 0 };
        const quarry = shot.target ? current.enemies.find(enemy => enemy.id === shot.target && enemy.hp > 0) : undefined;
        const end = quarry?.cargo ? transportView(quarry) : { x: shot.toX, y: shot.toY };
        const flown = Math.hypot(shot.x - lob.x, shot.y - lob.y), share = flown / Math.max(1, flown + Math.hypot(shot.toX - shot.x, shot.toY - shot.y));
        const x = lob.x + (end.x - lob.x) * share, y = lob.y + (end.y - lob.y) * share - lob.height * 4 * share * (1 - share);
        let ball = this.missiles.get(shot.id);
        if (!ball) { ball = this.add.sprite(x, y, "boom", "naval-shell").setDepth(LAYER.impact + 15); this.missiles.set(shot.id, ball); feedback.projectiles++; }
        ball.setPosition(Math.round(x), Math.round(y));
        continue;
      }
      const owner = typeof shot.by === "number" ? current.squads[shot.by] : undefined;
      const chongtong = shot.source === "hwacha" && owner?.soldiers[shot.unitIndex ?? -1]?.bph?.profileId === "Hero6_BloodMage";
      const art = chongtong ? CHONGTONG_SHOT_ART : shotArt(shot.kind, heading, shot.flaming);
      let sprite = this.missiles.get(shot.id);
      if (!sprite) {
        // 송상현's own shot is the tablet he throws; his soldiers and every other bow keep the arrow.
        const tablet = shot.kind === "arrow" && shot.source === "general" && current.squads.find(squad => squad.id === shot.by)?.general === "송상현";
        sprite = this.add.sprite(shot.x, shot.y, tablet ? "tablet-toss" : art.key, tablet ? 0 : art.frame).setDepth(LAYER.impact + 15);
        if (!chongtong && shot.kind === "rocket") sprite.play("rocket-flight");
        if (tablet) sprite.play("tablet-toss");
        this.missiles.set(shot.id, sprite); feedback.projectiles++;
        if (shot.flaming && !chongtong) feedback.flamingArrows++;
      }
      const scale = 1 + .28 * ((shot.tier ?? 1) - 1);
      sprite.setPosition(shot.x, shot.y).setRotation(art.rotation).setScale(scale).setTint(art.tint);
      if (shot.kind === "arrow" && sprite.texture.key === art.key) sprite.setFrame(art.frame);
      feedback.maxProjectileScale = Math.max(feedback.maxProjectileScale, scale);
      if (shot.flaming && !chongtong) {
        const tail = 9 * scale;
        this.shotTails.save().translateCanvas(Math.round(shot.x - Math.cos(heading) * tail), Math.round(shot.y - Math.sin(heading) * tail)).rotateCanvas(heading);
        this.painted.draw(this.shotTails, "flaming-arrow-tail", -21 * scale, -12 * scale, { width: Math.round(24 * scale), height: Math.round(24 * scale) });
        this.shotTails.restore();
      }
      if (shot.kind === "rocket" && !chongtong) {
        for (const [part, spread] of [-4, 4].entries()) {
          const x = shot.x - Math.sin(heading) * spread, y = shot.y + Math.cos(heading) * spread;
          this.shotTails.save().translateCanvas(Math.round(x), Math.round(y)).rotateCanvas(heading);
          this.painted.draw(this.shotTails, "rocket-tails", -21, part === 0 ? -6 : -5,
            { source: { x: 0, y: part * 12, width: 24, height: 12 }, width: 24, height: 12 });
          this.shotTails.restore();
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
      aimX: unit.x, aimY: unit.y, motion: enemyMotion(unit, -1), faceLeft: unit.x > CENTER.x, turnX: unit.x, rest: { x: unit.x, y: unit.y }, cycle: attackCycle() };
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
    const cavalry = cavalryPose(trooper.key), from = this.positions.get(unit) ?? unit;
    const special = cavalry && "specialAttack" in unit ? (unit as Squad).specialAttack : undefined;
    const windupAt = unit.strikeAt || special?.strikeAt || 0;
    const actors = cavalry ? current.bph?.fx.actors : undefined;
    const wheel = actors?.find(actor => actor.ownerId === unit.id && actor.kind === "wheel");
    let arrow: NonNullable<typeof actors>[number] | undefined;
    if (actors) for (let i = actors.length - 1; i >= 0; i--) {
      const actor = actors[i];
      if (actor.ownerId === unit.id && actor.cast?.spellId === "Spell_RiderPiercer"
        && current.time - actor.startedAt <= MOTION.lungeMs / 1000) { arrow = actor; break; }
    }
    const release = blow >= 0 && blow < duration;
    const actingNow = !out && (windupAt > 0 || release || !!arrow);
    const target = current.enemies.find(enemy => enemy.id === (unit.quarry ?? unit.aim));
    const lastAim = { x: trooper.aimX, y: trooper.aimY };
    const targetAt = cavalry && actingNow
      ? cavalryAttackTarget(current.enemies, arrow?.cast?.targetId ?? wheel?.data.targetId
        ?? (release ? trooper.attackTargetId : undefined) ?? (unit.strikeAt > 0 ? unit.aim : special?.aim ?? unit.aim),
      arrow ? { x: arrow.toX, y: arrow.toY } : wheel ? { x: wheel.toX, y: wheel.toY } : lastAim,
      enemy => this.positions.get(enemy) ?? enemy)
      : target ? this.positions.get(target) ?? target : lastAim;
    const general = unit.kind === "general", facing = attackFacing(from, targetAt);
    if (actingNow && (cavalry || unit.strikeAt > 0 || !spear)) {
      trooper.aimX = targetAt.x; trooper.aimY = targetAt.y;
    }
    sampleEnemyMotion(trooper.motion, unit, motionTime);
    if (actingNow) {
      if (cavalry ? targetAt.x !== from.x : !general || Math.abs(targetAt.x - from.x) >= TURN_DEADBAND.aim) trooper.faceLeft = facing.flipX;
      trooper.motion.faceLeft = trooper.faceLeft; trooper.motion.direction = facing.direction; trooper.turnX = unit.x;
    } else if (!out && trooper.motion.moving) {
      if (!general) trooper.faceLeft = trooper.motion.faceLeft;
      else if (Math.abs(unit.x - trooper.turnX) >= TURN_DEADBAND.walk) { trooper.faceLeft = unit.x < trooper.turnX; trooper.turnX = unit.x; }
    }
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
      trooper.sprite.setTexture(base === "geobukseon" ? base : bphUnitArt(unit, base), attack?.frame ?? 28 + start + Math.max(0, frame))
        .setPosition(unit.x, unit.y).setDepth(bodyDepth(unit.y)).setScale(1).setAlpha(out ? 0 : 1).setAngle(0).setFlipX(acting ? facing.flipX : trooper.faceLeft);
      trooper.rest = { x: unit.x, y: unit.y };
      this.shimmer(trooper, unit, channels.motion);
      return;
    }
    const at = this.positions.get(unit) ?? unit;
    const movement = current.bph?.fx.actors.find(actor => actor.ownerId === unit.id
      && (actor.data.monkHop === 1 || actor.data.martialLeap === 1 || actor.data.martialDismount === 1 || actor.data.martialSpectre === 1));
    const elevation = movement?.data.elevation ?? 0, spectre = movement?.data.martialSpectre === 1;
    // 격려 draws soldiers slightly larger (BPH_HERO_FRENZY.scale); a centred 32 px body is lifted so its feet stay on the ground point (full sets stand on their feet).
    const leader = unit.kind === "general", grown = leader ? 1 : bphHeroFrenzyScale(current), size = leader ? GENERAL_SCALE : grown;
    const rise = grown > 1 && !allyArt(bphUnitArt(unit, trooper.key)).full ? 16 * (grown - 1) : 0;
    const lift = leader ? 16 * (GENERAL_SCALE - 1) : rise + (unit.perch !== undefined ? WALL_LIFT : WALL_LIFT * Math.max(0, 1 - (now - trooper.fellAt) / 260) ** 2), stride = MOTION.stride * size;
    trooper.rest = { x: at.x, y: at.y - lift - elevation };
    const moving = !out && trooper.motion.moving, step = stepsWalked(trooper.motion.gait, stride);
    if (step !== trooper.motion.step) { trooper.motion.step = step; feedback.steps++; }
    const striking = !out && release, acting = actingNow;
    const phase = { windupProgress: windupAt > 0 ? 1 - (windupAt - current.time) / (trooper.windFor / 1000) : -1,
      sinceReleaseMs: arrow ? (current.time - arrow.startedAt) * 1000 : striking ? blow : -1, windupMs: trooper.windFor,
      contactMs: spear ? MOTION.spearContactMs : 0, recoveryMs: spear ? MOTION.spearRecoveryMs : MOTION.lungeMs };
    const css = this.scale.canvas.getBoundingClientRect().width / WIDTH;
    const bow = unit.basicAttack === "arrow";
    const offset = friendlyStrikeOffset(bow ? "archer" : unit.kind, phase);
    const push = out || !channels.motion ? 0 : spear && offset < 0 ? offset * 3 / FRIENDLY_ATTACK.spearman.pull / css : offset * size;
    const aim = Math.atan2(trooper.aimY - unit.y, trooper.aimX - unit.x);
    if (spear && striking && trooper.sprite.getData("trailAt") !== trooper.strikeAt) {
      trooper.sprite.setData("trailAt", trooper.strikeAt);
      this.tracer({ x: at.x, y: at.y - lift }, { x: at.x + Math.cos(aim) * push, y: at.y - lift + Math.sin(aim) * push }, true);
    }
    if (push !== 0) feedback.strikePoses++;
    trooper.key = bphUnitArt(unit, trooper.key);
    const art = allyArt(trooper.key), animation = allyAnimation(trooper.key, { moving, attacking: acting, bow, hurt: hurt < 110, down: out, direction: acting ? facing.direction : trooper.motion.direction });
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
    // The general's hit shows in his hurt frame only: the sideways jolt, refreshed by every arrow, read as him dithering left and right.
    const jolt = out || leader || hurt >= 110 || !channels.motion ? 0 : Math.floor(hurt / 28) % 2 ? 2 : -2, hop = moving && channels.motion && movement?.data.monkHop !== 1 ? stepHop(trooper.motion.gait, stride) * size : 0;
    const lean = !channels.motion ? 0 : out ? art.full ? 0 : 90 * fall : striking ? (trooper.faceLeft ? -1 : 1) * FRIENDLY_ATTACK[bow ? "archer" : unit.kind].swing * (1 - blow / duration) : moving ? Math.sin(trooper.motion.gait / stride * Math.PI) * MOTION.lean : 0;
    const squash = spear && striking && channels.motion && !art.full ? .08 * (blow < 50 ? 1 : Math.max(0, 1 - (blow - 50) / 100)) : 0;
    trooper.sprite.setOrigin(.5, art.full ? 1 - 32 / fullsetArt(art.actor).frame.height : .5)
      .setScale(size * (art.full && leader ? .5 : 1) * (1 + squash), size * (art.full && leader ? .5 : 1) * (1 - squash)).setPosition(at.x + Math.cos(aim) * push + jolt, at.y - lift + Math.sin(aim) * push - hop + (out ? 6 : 0))
      .setY(trooper.sprite.y - elevation)
      .setFlipX(spriteFlipX(trooper.key, trooper.faceLeft)).setAngle(lean).setAlpha((1 - fall * .65) * (leader ? 1 : this.emerged(unit)) * (spectre ? .65 : 1)).setDepth(bodyDepth(unit.perch !== undefined ? fortRect(current.fort).bottom + TILE : at.y));
    this.shimmer(trooper, unit, channels.motion);
  }
  /** Foil units wear a prism sheet over the body: a sweeping band, or a still rainbow edge when motion is off. A hit flash hides it. */
  private shimmer(trooper: Trooper, unit: Unit, moving: boolean): void {
    const body = trooper.sprite, key = body.texture.key, strength = unit.bph ? bphPrism(unit.bph.profileId, unit.bph.foil) : 0;
    if (!strength || key.endsWith("-hurt") || key.endsWith("-white")) { trooper.prism?.setVisible(false); return; }
    const sheet = this.prismTexture(key), frames = this.textures.get(key).frameTotal - 1;
    const row = moving ? Math.floor(this.time.now / PRISM_STEP_MS) % PRISM_PHASES : PRISM_STILL_ROW;
    trooper.prism ??= this.add.sprite(body.x, body.y, sheet, 0);
    trooper.prism.setTexture(sheet, row * frames + Number(body.frame.name)).setOrigin(body.originX, body.originY)
      .setPosition(body.x, body.y).setScale(body.scaleX, body.scaleY).setFlipX(body.flipX).setAngle(body.angle)
      .setAlpha(body.alpha * strength).setDepth(body.depth + .01).setVisible(body.visible);
  }
  private prismTexture(key: string): string {
    const sheetKey = `${key}-prism`;
    if (this.textures.exists(sheetKey)) return sheetKey;
    const source = this.textures.get(key), image = source.getSourceImage() as HTMLImageElement | HTMLCanvasElement, cell = source.get(0);
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
    if (!context) throw new Error("프리즘 그림 생성 실패");
    canvas.width = image.width; canvas.height = image.height;
    context.drawImage(image, 0, 0);
    // Slice by the cut grid: a padded full-set frame (setTrim) reports its logical size, not its cell.
    const pixels = prismSheet(context.getImageData(0, 0, image.width, image.height).data, image.width, image.height,
      { width: cell.cutWidth, height: cell.cutHeight });
    canvas.height = image.height * PRISM_ROWS;
    context.putImageData(new ImageData(pixels, image.width, canvas.height), 0, 0);
    const texture = this.textures.create(sheetKey, canvas, canvas.width, canvas.height);
    if (!texture) throw new Error(`중복 프리즘 그림: ${key}`);
    this.textures.addSpriteSheet(sheetKey, texture, { frameWidth: cell.cutWidth, frameHeight: cell.cutHeight });
    // Every row copies its source frame's padding so the shimmer sits exactly on the body.
    const frames = source.frameTotal - 1, prism = this.textures.get(sheetKey);
    for (let index = 0; index < frames; index++) {
      const frame = source.get(index);
      if (!frame.trimmed) continue;
      for (let row = 0; row < PRISM_ROWS; row++)
        prism.get(row * frames + index).setTrim(frame.realWidth, frame.realHeight, frame.x, frame.y, frame.width, frame.height);
    }
    return sheetKey;
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
    this.bar(box.x, box.y, 40, share, kind);
  }
  private bar(left: number, top: number, width: number, share: number, kind: "ally" | "enemy" | "revive"): void {
    this.bars.fillStyle(PALETTE.outline).fillRect(left, top, width, 5)
      .fillStyle(PALETTE.dark).fillRect(left + 1, top + 1, width - 2, 3)
      .fillStyle(kind === "enemy" ? PALETTE.danger : kind === "ally" ? PALETTE.ally : PALETTE.gold)
      .fillRect(left + 1, top + 1, Math.round((width - 2) * Math.max(0, share)), 3);
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
      if (down && squad.downUntil === Infinity) {
        // No temple: the general lies where he fell, dimmed, with no revive bar.
        troop.leader.sprite.setVisible(true).setAlpha(.85);
      } else if (down) {
        const left = Math.max(0, squad.downUntil - current.time), tent = buildings().infirmary;
        troop.leader.sprite.setAlpha(Math.min(.85, distance(squad, tent) / 30)).setVisible(distance(squad, tent) > 8);
        this.health(tent.x, tent.y + 4 + id * 12, 1 - left / downSeconds(current), "revive");
      } else {
        troop.leader.sprite.setVisible(true);
        if (current.time < squad.safeUntil) troop.leader.sprite.setAlpha(Math.floor(this.time.now / 100) % 2 ? .45 : 1);
        const head = restingHealthAnchor(troop.leader.sprite, troop.leader.rest);
        if (!entering && squad.hp < squad.maxHp) this.health(head.x, head.y - 6, squad.hp / squad.maxHp, "ally");
        if (!entering) drawAttackPreparation(this.bars, head, this.healthBoxes, squad, current.time, troop.leader, true);
      }
      squad.soldiers.forEach((unit, index) => {
        const trooper = troop.troopers[index];
        this.pose(trooper, unit, current, !fit(unit, current.time));
        const head = restingHealthAnchor(trooper.sprite, trooper.rest);
        if (fit(unit, current.time) && unit.hp < unit.maxHp) {
          const box = reserveHealthBar({ x: Math.round(head.x) - 11, y: Math.round(head.y) - 5, width: 22, height: 4 }, this.healthBoxes);
          this.bars.fillStyle(PALETTE.outline).fillRect(box.x, box.y, 22, 4)
            .fillStyle(PALETTE.dark).fillRect(box.x + 1, box.y + 1, 20, 2)
            .fillStyle(PALETTE.ally).fillRect(box.x + 1, box.y + 1, Math.round(20 * unit.hp / unit.maxHp), 2);
        }
        if (fit(unit, current.time)) drawAttackPreparation(this.bars, head, this.healthBoxes, unit, current.time, trooper, false);
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
    analytics?.frame(analytics.accepts(run) && !paused && viewPhase(run) === "playing");
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
    if (paused) { this.aimRing.clear(); this.tweens.timeScale = this.anims.globalTimeScale = 0; return; }
    const channels = feedbackChannels(saved.motionOff, saved.flashesOff, calm);
    const cssPixel = WIDTH / this.game.canvas.getBoundingClientRect().width;
    const held = this.impactBudget.holding(this.time.now, !channels.motion);
    this.tweens.timeScale = 1; this.anims.globalTimeScale = held ? 0 : 1;
    if (!attract && !unitSandbox && this.time.now >= this.hitStopUntil) {
      if (import.meta.env.CASTLE_SANDBOX_PREVIEW && sandbox) effects.push(...sandbox.advance(run, delta / 1000));
      else {
        this.accumulator += Math.min(delta / 1000, .1);
        while (this.accumulator >= 1 / 30) {
          effects.push(...advance(run, 1 / 30)); this.accumulator -= 1 / 30;
          analytics?.progress(run);
        }
      }
      analytics?.draws(run);
      observeRelics(run);
    }
    if (!attract) keepCodexChanges();
    this.particles.sample(delta); this.density = storm(run.time) * this.particles.headroom() * (this.quality ? .5 : 1);
    this.guardQuality(delta);
    this.river.setPosition(WIDTH / 2, riverBank()).setSize(WIDTH, HEIGHT - riverBank()).setOrigin(.5, 0);
    this.bank.setPosition(WIDTH / 2, riverBank() - 12).setSize(WIDTH, 32).setOrigin(.5, 0);
    this.river.tilePositionX = run.time * 4;
    element("arena").style.setProperty("--river-flow", String(-this.river.tilePositionX));
    this.bars.clear(); this.shotTails.clear(); this.marks.clear(); this.danger.clear(); this.alarm.clear(); this.rain.clear();
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
        for (const trooper of troop.troopers) if (!retained.has(trooper.unitId)) { trooper.sprite.destroy(); trooper.prism?.destroy(); }
        troop.troopers = retainRoster(squad.soldiers, existing, index => this.recruitTrooper(squad.soldiers[index].kind, squad.soldiers[index]));
        troop.signature = signature;
      }
    });
    effects = this.stage(effects, run, channels.motion, delta, cssPixel);
    this.damageNumbers.beginFrame(this.time.now);
    for (const effect of effects) if (effect.kind === "hit" && effect.value > 0 && effect.target !== undefined) {
      const target = this.foes.get(effect.target), castLook = skillHits.get(effect), skillHit = Boolean(castLook);
      const heavy = (castLook ?? hitVfx(run, effect)).heavy;
      if (isTabletHit(effect, run.squads)) {
        // Every tablet contact, including bounces, survives the optional decoration budgets.
        const contact = this.add.sprite(effect.x, effect.y - 6, "tablet-hit").setScale(2).setDepth(LAYER.impact + 15).play("tablet-hit");
        contact.once("animationcomplete", () => contact.destroy());
      }
      feedback.sparks += emitContactParticles({ scene: this, particles: this.particles, decoration: this.decoration, channels, cssPixel, skillHit, heavy }, effect);
      if (target) {
        const flash = hitFlash(this.time.now, Number(target.getData("flashStartedAt") ?? -1e9), Number(target.getData("flashUntil") ?? -1e9), Boolean(effect.critical));
        target.setData("flashUntil", flash.until).setData("flashStartedAt", flash.startedAt).setData("struckAt", this.time.now)
          .setData("criticalHit", Boolean(effect.critical))
          .setData("recoilAngle", Math.atan2(effect.y - (effect.fromY ?? CENTER.y), effect.x - (effect.fromX ?? CENTER.x)));
        holdHit(target, this.time.now, Boolean(effect.critical) || skillHit, channels.motion, this.decoration);
        if (channels.flash) feedback.whiteFlashes++;
        if (channels.motion) feedback.knockbacks++;
      }
      if (skillHit && heavy && this.impactBudget.big(this.time.now, !channels.motion)) feedback.shakes++;
      if (!damageNumberShown(skillHit || Boolean(effect.critical), this.numberMode())) continue;
      const head = target ? spriteHealthAnchor(target) : { x: effect.x, y: effect.y - 14 };
      const index = this.damageNumbers.add(head.x, head.y - 8, effect.value, Boolean(effect.critical), this.time.now, `foe:${effect.target}`, skillHit);
      if (index >= 0) {
        const slot = this.damageNumbers.slots[index], style = damageNumberStyle(slot.critical, slot.big);
        this.numberSprites[index].setFontSize(style.size * cssPixel).setStroke("#17131d", 2 * cssPixel)
          .setText(String(shownAmount(slot.value))).setColor(style.color);
        feedback.numbers++;
        if (effect.critical) feedback.criticalNumbers++;
      }
    }
    for (const effect of effects) {
      const striker = this.trooperOf(effect);
      const cavalry = striker && cavalryPose(striker.key);
      if (striker && (effect.mechanism !== "special" || cavalry) && (effect.kind === "shot" || effect.kind === "swing")) {
        striker.strikeAt = this.time.now; striker.aimX = effect.x; striker.aimY = effect.y;
        striker.attackTargetId = effect.target;
      } else if (striker && effect.kind === "hurt") {
        striker.hurtAt = this.time.now;
        const head = spriteHealthAnchor(striker.sprite);
        const index = damageNumberShown(false, this.numberMode()) ? this.damageNumbers.add(head.x, head.y - 8, effect.value, false, this.time.now, `ally:${striker.unitId}`) : -1;
        if (index >= 0) {
          this.numberSprites[index].setFontSize(10 * cssPixel).setStroke("#17131d", 2 * cssPixel)
            .setText(String(shownAmount(this.damageNumbers.slots[index].value))).setColor("#aab7cc");
          feedback.numbers++;
        }
      }
      if (striker && (effect.mechanism !== "special" || cavalry) && effect.kind === "windup") {
        striker.windFor = effect.value * 1000; striker.aimX = effect.x; striker.aimY = effect.y;
      }
      const foe = effect.target === undefined ? undefined : this.foes.get(effect.target);
      if (foe && effect.kind === "lunge")
        foe.setData("windAt", this.time.now).setData("windFor", effect.value * 1000).setData("aimX", effect.x).setData("aimY", effect.y);
      if (foe && (effect.kind === "wall" || effect.kind === "shot" && effect.hostile))
        foe.setData("lungeAt", this.time.now);
      if (!attract) cue(effect, run);

      // Shell contact is a gameplay receipt, even when its optional burst sprite is capped.
      if (effect.kind === "blast" && effect.by === "panokseon") this.navalImpact();
      if (!this.decoration.effect(effect, this.time.now)) continue;
      this.show(effect, run);
    }
    effects = [];
    if (!held) { this.syncFoes(run, cssPixel); this.syncTroops(run); this.syncShots(run); }
    this.syncField(run);
    thinBanner(run.telegraphs, cssPixel);
    this.uniqueSkillView?.sync(run, !channels.motion);
    const shake = this.impactBudget.sample(this.time.now, !channels.motion);
    this.cameras.main.setScroll(shake.x * cssPixel, shake.y * cssPixel);
    this.damageNumbers.slots.forEach((slot, index) => {
      const sprite = this.numberSprites[index];
      sprite.setVisible(slot.active);
      if (!slot.active) return;
      const pop = damageNumberFrame(this.time.now - slot.bumpedAt, slot.critical, channels.motion);
      const frame = { ...pop, rise: damageNumberFrame(this.time.now - slot.startedAt, slot.critical, channels.motion).rise,
        scale: pop.scale * mergedNumberScale(slot.hits) };
      const margin = (sprite.width / 2 + 2 * cssPixel) * frame.scale;
      sprite.setPosition(Phaser.Math.Clamp(slot.x, margin, WIDTH - margin),
        Phaser.Math.Clamp(slot.y - frame.rise * cssPixel, sprite.height * frame.scale / 2, HEIGHT - sprite.height / 2))
        .setAlpha(frame.alpha * damageNumberStyle(slot.critical, slot.big).alpha).setScale(frame.scale);
    });
    if (++this.frames % 5 === 0 || viewPhase(run) !== shownPhase || run.roulette) updateHud();
  }
}
const game = new Phaser.Game({ type: Phaser.CANVAS, parent: "arena", width: WIDTH, height: HEIGHT, backgroundColor: color(PALETTE.outline),
  pixelArt: true, antialias: false, roundPixels: true, audio: { noAudio: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [CastleScene] });
window.castleSample = { snapshot: () => run ? { ...run, enemyUnits: run.enemies, enemies: run.enemies.length, speed: 1, field: { width: WIDTH, height: HEIGHT }, feedback, paused, attract, sound: audioState() }
  : { phase: "ready", speed: 1 }, ...(unitSandbox ? { sandbox: {
    start: (general: BphGeneral = "권율") => { saved.firstBattleGuide = true; begin(1593, false, { general }); },
    run: () => run,
    step: (seconds: number) => {
      if (!run || !Number.isFinite(seconds) || seconds < 0 || seconds > 60) return;
      for (let left = seconds; left > 1e-8; left -= 1 / 30)
        effects.push(...advance(run, Math.min(left, 1 / 30)));
      updateHud();
    },
  } } : {}),
  quality: { get: () => arenaScene?.qualityLevel() ?? 0, force: (level: 0 | 1) => arenaScene?.forceQuality(level) } };
declare global { interface Window { castleSample: {
  quality: { get(): 0 | 1; force(level: 0 | 1): void };
  snapshot: () => Record<string, unknown>;
  sandbox?: { start: (general?: BphGeneral) => void; run: () => Run | null; step: (seconds: number) => void };
} } }
// Preview builds only: `?sandbox=1` opens the test bench (src/sandbox). Product builds drop this block, the chunk and sandboxInstall.
function sandboxInstall(make: () => Run): void {
  const arena = element("arena");
  setFieldSize(Math.round(800 * arena.clientWidth / arena.clientHeight / 2) * 2, 800);
  game.scale.setGameSize(WIDTH, HEIGHT);
  game.scale.setParentSize(arena.clientWidth, arena.clientHeight);
  attract = false; closeBphRelicToast();
  run = make();
  weatherHud.start(run.weather, true);
  bphField.replaceChildren(); updateBphField = undefined;
  setBgmScene("battle");
  feedback = freshFeedback(); effects = []; aims = []; shownPhase = "ready"; runSerial++; paused = false; picking = false; leveled = 1; settled = "";
  app.classList.remove("titled", "fronted"); notice.classList.remove("visible");
  titleLayer.hidden = true; overlay.hidden = true;
  reelStrip.hidden = true; spun = null; lastReel = -1; drillKey = ""; drills.hidden = false; element("building").hidden = true;
  updateHud();
}
if (import.meta.env.CASTLE_SANDBOX_PREVIEW && parameters.get("sandbox") === "1") {
  void import("./sandbox/panel").then(({ mountSandbox }) => {
    sandbox = mountSandbox({ meta, run: () => run, install: sandboxInstall, fire });
  });
}
