import { planBolt, strikeRing, strokeBolt } from "./shows/dongnae-show";
import type { Bolt } from "./shows/dongnae-show";
import { JINGAK_SHOW, paintShockwave } from "./shows/jingak-show";
import type { AmbientShow, FrameContext, Reach, SkillStage } from "./skill-stage";
import { TUNABLES } from "./tunables";

/** Display-only staging of the pointer tactics' spells (owner DM 1794922729.289679 "전술 뇌격 이펙트가 안보이네"). A 뇌격 bolt is
 *  송상현's thunderstorm stroke, dropped from the field's top edge onto the struck foe and swaying within the tactic's ring; a 지진
 *  shockwave is 황진's stomp wave running out to the real reach. Both are drawn on the stage's shared ground and trail layers, so they
 *  hold no sprites, and only the newest few stay alive at once. */
/** boltMs/foot: a bolt's whole afterglow, and its impact glow as a share of the tactic's radius. quakeAfterMs/quakeFadeMs: the
 *  shockwave runs for the stomp's wave time and then this long more while its echo and scorch fade. maxBolts/maxQuakes:
 *  concurrent pictures kept; the oldest goes first. */
export const TACTIC_STRIKE = TUNABLES.tacticStrikeShow;

type BoltStrike = { readonly bolt: Bolt; readonly reach: Reach; readonly cells: Reach["cells"]; readonly at: number };
type Quake = { readonly reach: Reach; readonly at: number };

class TacticStrikeShow implements AmbientShow {
  readonly id = "tactic-strikes";
  private bolts: BoltStrike[] = [];
  private quakes: Quake[] = [];
  private queued: { readonly kind: "bolt" | "quake"; readonly x: number; readonly y: number; readonly radius: number }[] = [];
  private next = 1;

  /** One 뇌격 bolt landing at (x, y); `radius` is the tactic ring's, which scales the bolt's sway and forks. */
  bolt(x: number, y: number, radius: number): void { this.queued.push({ kind: "bolt", x, y, radius }); }
  /** One 지진 shockwave at (x, y) out to the spell's real `radius`. */
  quake(x: number, y: number, radius: number): void { this.queued.push({ kind: "quake", x, y, radius }); }

  update(stage: SkillStage, { now, channels }: FrameContext): void {
    for (const { kind, x, y, radius } of this.queued) {
      if (kind === "bolt") {
        const reach = stage.reach(x, y, radius * TACTIC_STRIKE.foot);
        this.bolts.push({ bolt: planBolt({ id: this.next++, from: { x, y: 0 }, to: { x, y }, radius }), reach,
          cells: [...reach.cells].sort((a, b) => a.far - b.far), at: now });
      } else this.quakes.push({ reach: stage.reach(x, y, radius), at: now });
    }
    this.queued = [];
    this.bolts = this.bolts.slice(-TACTIC_STRIKE.maxBolts).filter(strike => now - strike.at < TACTIC_STRIKE.boltMs);
    const quakeMs = JINGAK_SHOW.wave + TACTIC_STRIKE.quakeAfterMs;
    this.quakes = this.quakes.slice(-TACTIC_STRIKE.maxQuakes).filter(quake => now - quake.at < quakeMs);
    for (const strike of this.bolts) {
      const glow = (now - strike.at) / TACTIC_STRIKE.boltMs;
      strikeRing(stage, strike.reach, strike.cells, glow, channels.flash);
      strokeBolt(stage, strike.bolt, glow, channels.flash);
    }
    for (const quake of this.quakes) {
      const since = now - quake.at, fade = Math.max(0, Math.min(1, (quakeMs - since) / TACTIC_STRIKE.quakeFadeMs));
      paintShockwave(stage, quake.reach, since, fade, channels.flash);
    }
  }

  clear(): void { this.bolts = []; this.quakes = []; this.queued = []; }
}

export const tacticStrikes = new TacticStrikeShow();
