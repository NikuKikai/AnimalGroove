import * as Tone from "tone";
import type { NoteState, RhythmEvent, TriggerEvent } from "../types";
import type { AudioChannelKey, AudioMixState } from "../state/gameStore";

type VoiceStyle = "hit" | "wrong" | "reference";

/** Owns the synth graph used for reference, hit, and wrong-note playback. */
export class AudioEngine {
  private started = false;

  private lastScheduledTime = 0;

  private mix: AudioMixState = {
    hit: { volume: 1.05, muted: false },
    reference: { volume: 0.18, muted: false },
    wrong: { volume: 0.4, muted: false },
  };

  private channelNodes = this.createChannelNodes();

  /** Starts the shared WebAudio context on the first user gesture. */
  async start() {
    if (this.started) {
      return;
    }

    await Tone.start();
    this.started = true;
    this.lastScheduledTime = Tone.now();
  }

  /** Applies UI-controlled mute and volume values to all audio channels. */
  setMix(mix: AudioMixState) {
    this.mix = mix;
    for (const style of Object.keys(mix) as VoiceStyle[]) {
      this.channelNodes[style].gain.gain.value = mix[style].volume;
    }
  }

  /** Plays the target groove note in its reference mix state when still unresolved. */
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

  /** Plays a produced trigger using the matched or wrong-note channel. */
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

  /** Dispatches one synth hit through the requested channel graph. */
  private playOneShot(style: VoiceStyle, pitch: string, time: number, velocity: number) {
    const channel = style as AudioChannelKey;
    const mixState = this.mix[channel];
    if (mixState.muted || mixState.volume <= 0) {
      return;
    }

    const node = this.channelNodes[style];
    node.gain.gain.value = mixState.volume;
    node.synth.triggerAttackRelease(pitch, getDuration(style), time, velocity);
  }

  /** Creates reusable synth, filter, and gain nodes for each audio channel. */
  private createChannelNodes(): Record<VoiceStyle, { synth: Tone.Synth; filter?: Tone.Filter; gain: Tone.Gain }> {
    const createChannel = (style: VoiceStyle) => {
      const synth = new Tone.Synth(getSynthConfig(style));
      const filter = getFilter(style);
      const gain = new Tone.Gain(this.mix[style].volume).toDestination();
      if (filter) {
        synth.connect(filter);
        filter.connect(gain);
      } else {
        synth.connect(gain);
      }
      return { synth, filter, gain };
    };

    return {
      hit: createChannel("hit"),
      wrong: createChannel("wrong"),
      reference: createChannel("reference"),
    };
  }

  /** Returns a strictly increasing Tone.js schedule time. */
  private nextTime() {
    const now = Tone.now() + 0.02;
    const next = Math.max(now, this.lastScheduledTime + 0.002);
    this.lastScheduledTime = next;
    return next;
  }
}

/** Returns the synth configuration used for a channel style. */
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

/** Returns the channel filter used to color reference and wrong notes. */
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

/** Returns the rhythmic duration used for a channel style. */
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

/** Maps a timbre id to a simple synthesized pitch. */
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
