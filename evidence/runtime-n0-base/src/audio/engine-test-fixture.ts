export class Param {
  value = 0;
  readonly events: { value: number; at: number }[] = [];
  setValueAtTime(value: number, at: number): void { this.value = value; this.events.push({ value, at }); }
  linearRampToValueAtTime(value: number, at: number): void { this.setValueAtTime(value, at); }
  exponentialRampToValueAtTime(value: number, at: number): void { this.setValueAtTime(value, at); }
  setTargetAtTime(value: number, at: number): void { this.setValueAtTime(value, at); }
  cancelScheduledValues(): void {}
}

export class Node {
  readonly gain = new Param();
  readonly frequency = new Param();
  readonly detune = new Param();
  readonly pan = new Param();
  readonly Q = new Param();
  readonly threshold = new Param();
  readonly knee = new Param();
  readonly ratio = new Param();
  readonly attack = new Param();
  readonly release = new Param();
  readonly delayTime = new Param();
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  readonly connections: (Node | Param)[] = [];
  disconnected = false;
  type = "";
  buffer: unknown;
  onended: (() => void) | null = null;
  connect(node: Node | Param): Node | Param { this.connections.push(node); return node; }
  disconnect(): void { this.disconnected = true; }
  start(at: number): void { this.starts.push(at); }
  stop(at: number): void { this.stops.push(at); }
}

/** Records WebAudio scheduling without replacing playEffect or Synth. */
export class Context {
  static instances: Context[] = [];
  currentTime = 1;
  state = "suspended";
  sampleRate = 100;
  readonly destination = new Node();
  readonly gains: Node[] = [];
  readonly oscillators: Node[] = [];
  readonly noises: Node[] = [];
  buffers = 0;
  resumes = 0;
  constructor() { Context.instances.push(this); }
  async resume(): Promise<void> { this.resumes++; this.state = "running"; }
  createGain(): Node { const node = new Node(); this.gains.push(node); return node; }
  createOscillator(): Node { const node = new Node(); this.oscillators.push(node); return node; }
  createBufferSource(): Node { const node = new Node(); this.noises.push(node); return node; }
  createStereoPanner(): Node { return new Node(); }
  createBiquadFilter(): Node { return new Node(); }
  createDynamicsCompressor(): Node { return new Node(); }
  createDelay(): Node { return new Node(); }
  createBuffer(_channels: number, length: number) {
    this.buffers++;
    const samples = new Float32Array(length);
    return { getChannelData: () => samples };
  }
}
