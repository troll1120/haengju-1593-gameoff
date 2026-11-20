/** Original procedural instruments; no samples or third-party audio assets. */
export type Note = {
  readonly hz: number;
  readonly endHz?: number;
  readonly seconds: number;
  readonly gain: number;
  readonly wave?: OscillatorType;
  readonly pan?: number;
  readonly reed?: boolean;
};

export class Synth {
  readonly context: BaseAudioContext;
  readonly bus: GainNode;
  readonly noiseBuffer: AudioBuffer;

  constructor(context: BaseAudioContext, destination: AudioNode, noiseBuffer?: AudioBuffer) {
    this.context = context;
    this.bus = context.createGain();
    this.bus.connect(destination);
    if (noiseBuffer) {
      this.noiseBuffer = noiseBuffer;
      return;
    }
    this.noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = this.noiseBuffer.getChannelData(0);
    let seed = 1593;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[i] = seed / 2147483648 - 1;
    }
  }

  tone(note: Note, at: number): void {
    const context = this.context;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const pan = context.createStereoPanner();
    const filter = context.createBiquadFilter();
    const end = at + note.seconds;
    oscillator.type = note.wave ?? "sine";
    oscillator.frequency.setValueAtTime(note.hz, at);
    oscillator.frequency.exponentialRampToValueAtTime(note.endHz ?? note.hz, end);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(note.gain, at + Math.min(.012, note.seconds / 5));
    if (note.reed) {
      envelope.gain.setValueAtTime(note.gain * .72, end - Math.min(.09, note.seconds * .3));
    }
    envelope.gain.exponentialRampToValueAtTime(.0001, end);
    pan.pan.value = note.pan ?? 0;
    filter.type = "lowpass";
    filter.frequency.value = note.reed ? 2700 : 12000;
    filter.Q.value = note.reed ? 1.6 : .7;
    oscillator.connect(filter).connect(envelope).connect(pan).connect(this.bus);
    let vibrato: OscillatorNode | undefined;
    let depth: GainNode | undefined;
    if (note.reed) {
      vibrato = context.createOscillator();
      depth = context.createGain();
      vibrato.frequency.value = 5.8;
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(17, at + Math.min(.16, note.seconds / 2));
      vibrato.connect(depth).connect(oscillator.detune);
      vibrato.start(at);
      vibrato.stop(end + .02);
    }
    oscillator.onended = () => {
      oscillator.disconnect(); filter.disconnect(); envelope.disconnect(); pan.disconnect();
      vibrato?.disconnect(); depth?.disconnect();
    };
    oscillator.start(at);
    oscillator.stop(end + .02);
  }

  noise(at: number, voice: { readonly seconds: number; readonly gain: number; readonly hz: number; readonly q?: number }): void {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = voice.hz;
    filter.Q.value = voice.q ?? .7;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(voice.gain, at + .002);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + voice.seconds);
    source.connect(filter).connect(envelope).connect(this.bus);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
    source.start(at, 0, voice.seconds + .02);
  }

  /** Gayageum-like plucked string: bent attack (nonghyeon), bright partials that fade fast. */
  pluck(hz: number, at: number, seconds: number, gain: number, pan = 0): void {
    const context = this.context;
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const end = at + seconds;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + .004);
    envelope.gain.exponentialRampToValueAtTime(.0001, end);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(6000, at);
    filter.frequency.exponentialRampToValueAtTime(1100, end);
    panner.pan.value = pan;
    filter.connect(envelope).connect(panner).connect(this.bus);
    let open = 4;
    for (const [ratio, level] of [[1, 1], [2, .42], [3, .26], [4, .1]] as const) {
      const oscillator = context.createOscillator();
      const part = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(hz * ratio * 1.035, at);
      oscillator.frequency.exponentialRampToValueAtTime(hz * ratio, at + .055);
      part.gain.value = level;
      oscillator.connect(part).connect(filter);
      oscillator.onended = () => {
        oscillator.disconnect(); part.disconnect();
        if (--open === 0) { filter.disconnect(); envelope.disconnect(); panner.disconnect(); }
      };
      oscillator.start(at);
      oscillator.stop(end + .02);
    }
    this.noise(at, { seconds: .025, gain: gain * .3, hz: 3200 });
  }

  /** Small hand gong (kkwaenggwari): bright metallic tick. */
  kkwaenggwari(at: number, gain = .05): void {
    this.tone({ hz: 1850, endHz: 1790, seconds: .09, gain, wave: "square", pan: -.3 }, at);
    this.noise(at, { seconds: .06, gain: gain * 1.4, hz: 5600, q: 4 });
  }

  buk(at: number, gain = .3, pitch = 1): void {
    this.tone({ hz: 135 * pitch, endHz: 48 * pitch, seconds: .23, gain }, at);
    this.noise(at, { seconds: .065, gain: gain * .3, hz: 380 * pitch });
  }

  janggu(at: number, open = false): void {
    this.tone({ hz: open ? 275 : 390, endHz: open ? 168 : 230,
      seconds: open ? .19 : .095, gain: open ? .13 : .085, wave: "triangle", pan: .25 }, at);
    this.noise(at, { seconds: open ? .12 : .045, gain: open ? .12 : .09, hz: 2200, q: 1.1 });
  }
}

export function createMix(context: BaseAudioContext): GainNode {
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const output = context.createGain();
  compressor.threshold.value = -16;
  compressor.knee.value = 8;
  compressor.ratio.value = 5;
  compressor.attack.value = .004;
  compressor.release.value = .16;
  output.gain.value = .74;
  master.connect(compressor).connect(output).connect(context.destination);
  return master;
}
