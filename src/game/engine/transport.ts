type TickListener = (beat: number, deltaSeconds: number) => void;

/** Tracks looped musical time and notifies subscribers on every animation frame. */
export class Transport {
  private listeners = new Set<TickListener>();

  private lastTime = 0;

  private frameId = 0;

  private running = false;

  private beat = 0;

  /** Creates a transport with the given tempo and loop length. */
  constructor(
    public bpm: number,
    public loopBeats: number,
  ) {}

  /** Returns the current wrapped beat position. */
  get currentBeat() {
    return this.beat;
  }

  /** Moves playback to a specific wrapped beat. */
  setPosition(beat: number) {
    this.beat = wrapBeat(beat, this.loopBeats);
  }

  /** Updates tempo and loop length while keeping the beat in range. */
  updateConfig(bpm: number, loopBeats: number) {
    this.bpm = bpm;
    this.loopBeats = loopBeats;
    this.beat = wrapBeat(this.beat, loopBeats);
  }

  /** Registers a tick listener and returns its unsubscribe callback. */
  subscribe(listener: TickListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Starts the animation-frame driven transport loop. */
  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lastTime = performance.now();
    this.frameId = window.requestAnimationFrame(this.tick);
  }

  /** Stops ticking without resetting the current beat. */
  stop() {
    this.running = false;
    window.cancelAnimationFrame(this.frameId);
  }

  /** Resets playback to beat zero and refreshes the frame timer. */
  reset() {
    this.beat = 0;
    this.lastTime = performance.now();
  }

  /** Stops the transport and removes all listeners. */
  dispose() {
    this.stop();
    this.listeners.clear();
  }

  /** Advances the transport by one animation frame. */
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

/** Wraps a beat value into the transport loop range. */
function wrapBeat(beat: number, loopBeats: number) {
  const wrapped = beat % loopBeats;
  return wrapped < 0 ? wrapped + loopBeats : wrapped;
}
