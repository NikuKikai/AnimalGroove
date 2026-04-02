import * as Tone from "tone";
import type { NoteState, RhythmEvent, TriggerEvent } from "../types";

export class AudioEngine {
  private started = false;

  private lastScheduledTime = 0;

  private hitSynth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.004, decay: 0.08, sustain: 0.06, release: 0.08 },
  }).toDestination();

  private wrongSynth = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
  });

  private ambienceSynth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.18, sustain: 0, release: 0.08 },
  });

  private lowPass = new Tone.Filter(500, "lowpass");

  private highPass = new Tone.Filter(1800, "highpass");

  private normalGain = new Tone.Gain(0.9).toDestination();

  private distantGain = new Tone.Gain(0.25).toDestination();

  private wrongGain = new Tone.Gain(0.45).toDestination();

  constructor() {
    this.hitSynth.connect(this.normalGain);
    this.ambienceSynth.connect(this.lowPass);
    this.lowPass.connect(this.distantGain);
    this.wrongSynth.connect(this.highPass);
    this.highPass.connect(this.wrongGain);
  }

  async start() {
    if (this.started) {
      return;
    }

    await Tone.start();
    this.started = true;
    this.lastScheduledTime = Tone.now();
  }

  playReference(note: RhythmEvent, state: NoteState) {
    if (!this.started) {
      return;
    }

    try {
      const pitch = mapTimbreToPitch(note.timbre);
      const time = this.nextTime();
      if (state === "matched") {
        return;
      }

      this.ambienceSynth.triggerAttackRelease(pitch, "16n", time, 0.55);
    } catch {
      return;
    }
  }

  playTrigger(trigger: TriggerEvent, matched: boolean) {
    if (!this.started) {
      return;
    }

    try {
      const pitch = mapTimbreToPitch(trigger.timbre);
      const time = this.nextTime();
      if (matched) {
        this.hitSynth.triggerAttackRelease(pitch, "16n", time, 0.95);
      } else {
        this.wrongSynth.triggerAttackRelease(pitch, "32n", time, 0.5);
      }
    } catch {
      return;
    }
  }

  private nextTime() {
    const now = Tone.now() + 0.02;
    const next = Math.max(now, this.lastScheduledTime + 0.002);
    this.lastScheduledTime = next;
    return next;
  }
}

function mapTimbreToPitch(timbre: string) {
  switch (timbre) {
    case "kick":
      return "C2";
    case "snare":
      return "G2";
    case "hat":
      return "C4";
    case "clap":
      return "D4";
    case "tom":
      return "F2";
    default:
      return "A3";
  }
}
