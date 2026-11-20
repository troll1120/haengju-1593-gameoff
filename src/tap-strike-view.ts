import type Phaser from "phaser";
import { BPH_TAP_STRIKE } from "./bph-tap-strike";
import type { Point } from "./geometry";
import { ARROW_ART, bodyDepth, LAYER, shotArt } from "./presentation";
import type { Effect } from "./rules";

type Flight = { readonly image: Phaser.GameObjects.Image; readonly from: Point; readonly to: Point;
  readonly leaveAt: number; readonly landAt: number; landed: boolean };
type Impact = { readonly spots: readonly Point[]; readonly at: number; readonly fire: boolean; done: boolean };

const ARROWS = 12, LIFT = 90, STAND = 420, FADE = 220, BURIED_ROWS = 4, LAUNCH_GAP = 14;

/** The tap-strike volley drawn with the shipped arrow sheet: arrows arc up off the castle and come down over the
 *  tapped circle as the damage lands, stand for a moment, then fade. Fire arrows carry the sheet's flame tint. */
export class TapStrikeView {
  private flights: Flight[] = [];
  private impacts: Impact[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly land: (at: Point, fire: boolean) => void) {}

  launch(effect: Effect, now: number, still: boolean): void {
    const fire = effect.label === "fire", landAt = now + BPH_TAP_STRIKE.travelSeconds * 1000;
    const from = { x: effect.fromX ?? effect.x, y: (effect.fromY ?? effect.y) - 24 }, reach = effect.value * .8;
    const spots = Array.from({ length: ARROWS }, (_, index) => {
      const turn = index * 2.399963, far = reach * Math.sqrt((index + .5) / ARROWS);
      return { x: effect.x + Math.cos(turn) * far, y: effect.y + Math.sin(turn) * far };
    });
    for (const [index, to] of spots.entries()) {
      const art = shotArt("arrow", Math.PI / 2, fire);
      const image = this.scene.add.image(to.x, to.y, ARROW_ART.key, art.frame).setTint(art.tint)
        .setDepth(LAYER.impact + 40).setVisible(false);
      this.flights.push({ image, from: { x: from.x + (index - ARROWS / 2) * 2, y: from.y }, to,
        leaveAt: still ? landAt : now + (index % 4) * LAUNCH_GAP, landAt, landed: false });
    }
    this.impacts.push({ spots: spots.filter((_, index) => index % 3 === 0), at: landAt, fire, done: false });
  }

  update(now: number): void {
    for (const impact of this.impacts) if (!impact.done && now >= impact.at) {
      impact.done = true;
      for (const spot of impact.spots) this.land(spot, impact.fire);
    }
    this.impacts = this.impacts.filter(impact => !impact.done);
    this.flights = this.flights.filter(flight => this.fly(flight, now));
  }

  clear(): void {
    for (const flight of this.flights) flight.image.destroy();
    this.flights = []; this.impacts = [];
  }

  private fly(flight: Flight, now: number): boolean {
    const { image, from, to } = flight;
    if (now < flight.leaveAt) return true;
    if (now < flight.landAt) {
      const share = (now - flight.leaveAt) / (flight.landAt - flight.leaveAt);
      const x = from.x + (to.x - from.x) * share, y = from.y + (to.y - from.y) * share - LIFT * 4 * share * (1 - share);
      const heading = Math.atan2(to.y - from.y - LIFT * 4 * (1 - 2 * share), to.x - from.x);
      image.setVisible(true).setPosition(x, y).setFrame(shotArt("arrow", heading).frame);
      return true;
    }
    const age = now - flight.landAt;
    if (age >= STAND + FADE) { image.destroy(); return false; }
    if (!flight.landed) {
      flight.landed = true;
      image.setVisible(true).setPosition(to.x, to.y).setFrame(shotArt("arrow", Math.PI / 2).frame)
        .setDepth(bodyDepth(to.y)).setCrop(0, 0, ARROW_ART.size, ARROW_ART.size - BURIED_ROWS);
    }
    image.setAlpha(age < STAND ? 1 : 1 - (age - STAND) / FADE);
    return true;
  }
}

