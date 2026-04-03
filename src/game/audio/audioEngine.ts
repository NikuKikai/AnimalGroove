import * as Tone from "tone";
import type { NoteState, RhythmEvent, TriggerEvent } from "../types";
import type { AudioChannelKey, AudioMixState } from "../state/gameStore";

type VoiceStyle = "hit" | "wrong" | "reference";

export class AudioEngine {
  private started = false;

  private lastScheduledTime = 0;

  private mix: AudioMixState = {
    hit: { volume: 1.05, muted: false },
    reference: { volume: 0.18, muted: false },
    wrong: { volume: 0.4, muted: false },
  };

  async start() {
    if (this.started) {
      return;
    }

    await Tone.start();
    this.started = true;
    this.lastScheduledTime = Tone.now();
  }

  setMix(mix: AudioMixState) {
    this.mix = mix;
  }

  playReference(note: RhythmEvent, state: NoteState) {
    if (!this.started || state === "matched") {
      return;
    }

    try {
      this.playOneShot("reference", mapTimbreToPitch(note.timbre), this.nextTime(), 0.45);
    } catch {
      return;
    }
  }

  playTrigger(trigger: TriggerEvent, matched: boolean) {
    if (!this.started) {
      return;
    }

    try {
      this.playOneShot(
        matched ? "hit" : "wrong",
        mapTimbreToPitch(trigger.timbre),
        this.nextTime(),
        matched ? 0.95 : 0.5,
      );
    } catch {
      return;
    }
  }

  private playOneShot(style: VoiceStyle, pitch: string, time: number, velocity: number) {
    const channel = style as AudioChannelKey;
    const mixState = this.mix[channel];
    if (mixState.muted || mixState.volume <= 0) {
      return;
    }

    const synth = new Tone.Synth(getSynthConfig(style));
    const filter = getFilter(style);
    const gain = new Tone.Gain(mixState.volume);

    if (filter) {
      synth.connect(filter);
      filter.connect(gain);
    } else {
      synth.connect(gain);
    }

    gain.toDestination();
    synth.triggerAttackRelease(pitch, getDuration(style), time, velocity);

    const disposeDelayMs = 1200;
    window.setTimeout(() => {
      synth.dispose();
      filter?.dispose();
      gain.dispose();
    }, disposeDelayMs);
  }

  private nextTime() {
    const now = Tone.now() + 0.02;
    const next = Math.max(now, this.lastScheduledTime + 0.002);
    this.lastScheduledTime = next;
    return next;
  }
}

function getSynthConfig(style: VoiceStyle) {
  switch (style) {
    case "hit":
      return {
        oscillator: { type: "triangle" as const },
        envelope: { attack: 0.003, decay: 0.08, sustain: 0.08, release: 0.08 },
      };
    case "wrong":
      return {
        oscillator: { type: "square" as const },
        envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.035 },
      };
    case "reference":
      return {
        oscillator: { type: "sine" as const },
        envelope: { attack: 0.004, decay: 0.12, sustain: 0, release: 0.05 },
      };
  }
}

function getFilter(style: VoiceStyle) {
  switch (style) {
    case "wrong":
      return new Tone.Filter(1800, "highpass");
    case "reference":
      return new Tone.Filter(500, "lowpass");
    default:
      return undefined;
  }
}

function getDuration(style: VoiceStyle) {
  switch (style) {
    case "hit":
      return "16n";
    case "wrong":
      return "32n";
    case "reference":
      return "16n";
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
