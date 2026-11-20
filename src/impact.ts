/** Preserve the scene's simulation-stop contract independently of camera decoration. */
export class ImpactBudget {
  private stops: { at: number; ms: number }[] = [];
  private lastShake = -Infinity;
  private lastCamera = -Infinity;
  private lastBigHold = -Infinity;
  private cameraCount = 0;
  private shakeAt = -Infinity;
  private shakeDuration = 0;
  private shakeAmplitude = 0;
  private displayUntil = -Infinity;

  /** Actual major camera events, independent of admitted simulation stops. */
  get cameraEvents(): number { return this.cameraCount; }

  request(at: number, major: boolean, reduced: boolean, strength = .01, glow = 180): { allowed: boolean; stop: number } {
    if (reduced || at - this.lastShake < 2000) return { allowed: false, stop: 0 };
    this.lastShake = at;
    this.stops = this.stops.filter(item => at - item.at < 60000);
    const stop = major && this.stops.length < 4 ? 90 : 0;
    if (stop) this.stops.push({ at, ms: stop });
    if (major && strength > 0 && at - this.lastCamera >= 2000) {
      this.lastCamera = at; this.cameraCount++;
      this.shakeAt = at;
      this.shakeDuration = Math.max(100, Math.min(240, glow));
      this.shakeAmplitude = strength >= .014 ? 4 : strength >= .008 ? 3 : 2;
    }
    if (stop) this.displayUntil = at + 67;
    return { allowed: true, stop };
  }

  /** Critical decoration must never consume the simulation-stop allowance. */
  critical(at: number, reduced: boolean): boolean {
    if (reduced || at - this.shakeAt < 500) return false;
    this.shakeAt = at; this.shakeDuration = 100; this.shakeAmplitude = 1.5;
    return true;
  }

  /** Skill hits retain their 250 ms display-hold cadence; camera events share the major two-second budget. */
  big(at: number, reduced: boolean): boolean {
    if (reduced || at - Math.max(this.shakeAt, this.lastBigHold) < 250) return false;
    this.lastBigHold = at;
    this.displayUntil = Math.max(this.displayUntil, at + 50);
    if (at - this.lastCamera < 2000) return false;
    this.lastCamera = at; this.cameraCount++;
    this.shakeAt = at; this.shakeDuration = 140; this.shakeAmplitude = 3;
    return true;
  }

  holding(at: number, reduced: boolean): boolean {
    return !reduced && at < this.displayUntil;
  }

  /** CSS-pixel camera displacement; no simulation clock or random state is consumed. */
  sample(at: number, reduced: boolean): { x: number; y: number } {
    const age = at - this.shakeAt;
    if (reduced || age < 0 || age >= this.shakeDuration) return { x: 0, y: 0 };
    const amplitude = this.shakeAmplitude * (1 - age / this.shakeDuration) ** 2;
    return { x: Math.sin(age * .12) * amplitude, y: Math.sin(age * .15) * amplitude };
  }
}
