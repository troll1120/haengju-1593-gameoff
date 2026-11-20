/** Preserve the scene's simulation-stop contract independently of camera decoration. */
export class ImpactBudget {
  private stops: { at: number; ms: number }[] = [];
  private lastShake = -Infinity;
  private shakeAt = -Infinity;
  private shakeDuration = 0;
  private shakeAmplitude = 0;
  private displayUntil = -Infinity;

  request(at: number, major: boolean, reduced: boolean): { allowed: boolean; stop: number } {
    if (reduced || at - this.lastShake < 2000) return { allowed: false, stop: 0 };
    this.lastShake = at;
    this.stops = this.stops.filter(item => at - item.at < 60000);
    const stop = major && this.stops.length < 4 ? 90 : 0;
    if (stop) this.stops.push({ at, ms: stop });
    if (major) {
      this.shakeAt = at; this.shakeDuration = 180; this.shakeAmplitude = 3;
      if (stop) this.displayUntil = at + 67;
    }
    return { allowed: true, stop };
  }

  /** Critical decoration must never consume the simulation-stop allowance. */
  critical(at: number, reduced: boolean): boolean {
    if (reduced || at - this.shakeAt < 500) return false;
    this.shakeAt = at; this.shakeDuration = 100; this.shakeAmplitude = 1.5;
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
