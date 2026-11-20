import type { ChaosFleetPass } from "./chaos-contract";
import type { Point } from "./geometry";
import type { Effect, Enemy } from "./rules";
import { HELD_KINDS, releases } from "./skill-show";

/** Presentation receipts live outside Run and Effect: neither replay data nor the random stream changes. */
const HEALTH = new WeakMap<Effect, { readonly enemy: Readonly<Enemy>; readonly amount: number }>();
const FLEET = new WeakMap<Effect, ChaosFleetPass>();
export function noteHitHealth(hit: Effect, enemy: Enemy, amount: number): void {
  HEALTH.set(hit, { enemy, amount });
}
export function noteFleetResults(pass: ChaosFleetPass, results: readonly Effect[]): void {
  for (const result of results) if (HELD_KINDS.has(result.kind)) FLEET.set(result, pass);
}
export function fleetResult(effect: Effect): ChaosFleetPass | undefined { return FLEET.get(effect); }

type Clock = "stage" | "fleet";
type Waiting = { readonly effect: Effect; readonly at: number; readonly clock: Clock; readonly spot?: Point;
  readonly health: boolean; readonly after: { readonly item: Waiting; readonly delay: number }[] };

/** The shared presentation hold. Stage time drives cast shows; simulation time drives ambient fleet pictures.
 * Damage stays exact (including fractions and overkill), while the rules' target objects remain read-only here. */
export class SkillHolds {
  private queue: Waiting[] = [];
  private readonly targets = new Map<number, Readonly<Enemy>>();
  private readonly offsets = new Map<number, number>();
  private readonly falls = new Set<number>();
  private readonly pins = new Map<number, Point>();
  private readonly remainingTimes = new Map<Waiting, number>();
  private stage = 0;
  private fleet = 0;

  holds(id: number): boolean { return this.falls.has(id); }
  pinned(id: number): Point | undefined { return this.pins.get(id); }
  target(id: number): Readonly<Enemy> | undefined { return this.targets.get(id); }
  hp(id: number, actual: number): number { return Math.max(0, actual + (this.offsets.get(id) ?? 0)); }

  /** timeOf is relative milliseconds; both clocks use milliseconds, but only the fleet clock pauses with simulation. */
  hold(results: readonly Effect[], timeOf: (effect: Effect, index: number) => number, flash: number,
    drawn: (effect: Effect) => Point | undefined, clock: Clock = "stage", origin?: number, health = true): void {
    const now = origin ?? (clock === "stage" ? this.stage : this.fleet);
    const preceding = [...this.queue], added: Waiting[] = [];
    for (const { effect, at } of releases(results, timeOf, flash)) {
      const after = preceding.filter(item =>
        item.health && item.effect.kind === "hit" && item.effect.target === effect.target && effect.target !== undefined)
        .map(item => ({ item, delay: effect.kind === "kill" ? flash : 0 }));
      const spot = effect.kind === "hit" ? drawn(effect) : undefined;
      const keepsHealth = health || after.length > 0;
      added.push({ effect, at: now + at, clock, spot: spot ? { x: spot.x, y: spot.y } : undefined, health: keepsHealth, after });
      const receipt = keepsHealth ? HEALTH.get(effect) : undefined;
      if (effect.target !== undefined && receipt) this.targets.set(effect.target, receipt.enemy);
    }
    let fall: Waiting | undefined;
    for (const item of added) {
      if (item.effect.kind === "kill") {
        item.after.push(...added.filter(hit => hit.effect.kind === "hit" && hit.effect.target === item.effect.target)
          .map(hit => ({ item: hit, delay: flash })));
        fall = item;
      } else if (item.effect.kind === "coin" && fall) item.after.push({ item: fall, delay: 0 });
    }
    this.queue.push(...added);
    this.index();
  }

  /** Later hits and falls cannot overtake an unseen hit on the same foe. Other foes and combat continue normally. */
  follow(batch: readonly Effect[], flash: number): Effect[] {
    const held: Effect[] = [];
    let fall: Waiting | undefined;
    for (const effect of batch) {
      if (!HELD_KINDS.has(effect.kind)) continue;
      if (effect.kind === "kill") fall = undefined;
      const previous = effect.kind === "coin" ? fall : effect.target === undefined ? undefined
        : this.queue.filter(item => item.health && item.effect.target === effect.target && item.effect.kind === "hit")
          .sort((a, b) => this.remaining(b) - this.remaining(a))[0];
      if (!previous) continue;
      const at = previous.at + (effect.kind === "kill" ? flash : 0);
      const item: Waiting = { effect, at, clock: previous.clock, spot: previous.spot, health: true,
        after: [{ item: previous, delay: effect.kind === "kill" ? flash : 0 }] };
      this.queue.push(item);
      if (effect.kind === "kill") fall = item;
      const health = item.health ? HEALTH.get(effect) : undefined;
      if (effect.target !== undefined && health) this.targets.set(effect.target, health.enemy);
      held.push(effect);
    }
    if (held.length) this.index();
    return held;
  }

  update(stage: number, fleet: number, motion = true): Effect[] {
    this.stage = stage; this.fleet = fleet;
    this.remainingTimes.clear();
    this.queue.sort((a, b) => this.remaining(a) - this.remaining(b));
    const ready = this.queue.filter(item => !motion || this.remaining(item) <= 1e-7);
    this.queue = this.queue.filter(item => motion && this.remaining(item) > 1e-7);
    this.index();
    return ready.map(item => item.effect);
  }

  clear(): void {
    this.queue = []; this.targets.clear(); this.offsets.clear(); this.falls.clear(); this.pins.clear();
    this.remainingTimes.clear();
  }

  private remaining(item: Waiting): number {
    const known = this.remainingTimes.get(item);
    if (known !== undefined) return known;
    const time = Math.max(item.at - (item.clock === "stage" ? this.stage : this.fleet),
      ...item.after.map(before => this.remaining(before.item) + before.delay));
    this.remainingTimes.set(item, time);
    return time;
  }
  private index(): void {
    this.offsets.clear(); this.falls.clear(); this.pins.clear();
    const active = new Set<number>();
    for (const item of [...this.queue].sort((a, b) => this.remaining(a) - this.remaining(b))) {
      const { effect, spot } = item, id = effect.target;
      if (id === undefined) continue;
      active.add(id);
      if (effect.kind === "kill") this.falls.add(id);
      if (effect.kind !== "hit") continue;
      const health = item.health ? HEALTH.get(effect) : undefined;
      if (health) this.offsets.set(id, (this.offsets.get(id) ?? 0) + health.amount);
      if (spot && !this.pins.has(id)) this.pins.set(id, spot);
    }
    for (const id of this.targets.keys()) if (!active.has(id)) this.targets.delete(id);
  }
}
