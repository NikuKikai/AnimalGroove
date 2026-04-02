type TickListener = (beat: number, deltaSeconds: number) => void;

export class Transport {
  private listeners = new Set<TickListener>();

  private lastTime = 0;

  private frameId = 0;

  private running = false;

  private beat = 0;

  constructor(
    public bpm: number,
    public loopBeats: number,
  ) {}

  get currentBeat() {
    return this.beat;
  }

  setPosition(beat: number) {
    this.beat = wrapBeat(beat, this.loopBeats);
  }

  updateConfig(bpm: number, loopBeats: number) {
    this.bpm = bpm;
    this.loopBeats = loopBeats;
    this.beat = wrapBeat(this.beat, loopBeats);
  }

  subscribe(listener: TickListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastTime = performance.now();
    this.frameId = window.requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    window.cancelAnimationFrame(this.frameId);
  }

  reset() {
    this.beat = 0;
    this.lastTime = performance.now();
  }

  dispose() {
    this.stop();
    this.listeners.clear();
  }

  private tick = (now: number) => {
    if (!this.running) {
      return;
    }

    const deltaSeconds = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.beat = wrapBeat(this.beat + (deltaSeconds * this.bpm) / 60, this.loopBeats);
    for (const listener of this.listeners) {
      listener(this.beat, deltaSeconds);
    }
    this.frameId = window.requestAnimationFrame(this.tick);
  };
}

function wrapBeat(beat: number, loopBeats: number) {
  const wrapped = beat % loopBeats;
  return wrapped < 0 ? wrapped + loopBeats : wrapped;
}
