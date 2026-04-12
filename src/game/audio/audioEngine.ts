import * as Tone from "tone";
import { gameConfig } from "../config/gameConfig";
import type { NoteState, RhythmEvent, TriggerEvent } from "../types";
import type { AudioChannelKey, AudioMixState } from "../state/gameStore";

type VoiceStyle = "hit" | "wrong" | "reference";

type ChannelNode = {
  synth: Tone.Synth;
  input: Tone.Gain;
  filter?: Tone.Filter;
  gain: Tone.Gain;
  foleyPlayers: Map<string, Tone.Player>;
};

const foleySourceMap: Record<string, string> = gameConfig.audio.foley.sources;

/** Owns the synth and sample graph used for reference, hit, and wrong-note playback. */
export class AudioEngine {
  private started = false;

  private lastScheduledTime = 0;

  private mix: AudioMixState = {
    hit: { ...gameConfig.audio.defaultMix.hit },
    reference: { ...gameConfig.audio.defaultMix.reference },
    wrong: { ...gameConfig.audio.defaultMix.wrong },
  };

  private channelNodes = this.createChannelNodes();

  /** Starts the shared WebAudio context on the first user gesture. */
  async start() {
    if (this.started) {
      return;
    }

    Tone.getContext().lookAhead = gameConfig.audio.lookAhead;
    await Tone.start();
    await Tone.loaded();
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
      this.playOneShot("reference", note.timbre, this.nextTime(), gameConfig.audio.triggerVelocity.reference);
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
        trigger.timbre,
        this.nextTime(),
        (matched ? gameConfig.audio.triggerVelocity.matched : gameConfig.audio.triggerVelocity.wrong) * trigger.weight,
      );
    } catch {
      return;
    }
  }

  /** Dispatches one note to either synth or foley player through the requested channel graph. */
  private playOneShot(style: VoiceStyle, timbre: string, time: number, velocity: number) {
    const channel = style as AudioChannelKey;
    const mixState = this.mix[channel];
    if (mixState.muted || mixState.volume <= 0) {
      return;
    }

    const node = this.channelNodes[style];
    node.gain.gain.value = mixState.volume;

    const normalizedTimbre = timbre.toLowerCase();
    if (isFoleyTimbre(normalizedTimbre)) {
      const player = node.foleyPlayers.get(normalizedTimbre);
      if (!player || !player.loaded) {
        return;
      }
      player.volume.value = Tone.gainToDb(
        Math.min(gameConfig.audio.foley.maximumGain, Math.max(gameConfig.audio.foley.minimumGain, velocity)) *
          gameConfig.audio.foley.gainFactor,
      );
      player.start(time, 0);
      return;
    }

    node.synth.triggerAttackRelease(
      mapTimbreToPitch(normalizedTimbre),
      getDuration(style),
      time,
    );
  }

  /** Creates reusable synth, filter, foley players, and gain nodes for each audio channel. */
  private createChannelNodes(): Record<VoiceStyle, ChannelNode> {
    const createChannel = (style: VoiceStyle) => {
      const input = new Tone.Gain(1);
      const synth = new Tone.Synth(getSynthConfig(style));
      const filter = getFilter(style);
      const gain = new Tone.Gain(this.mix[style].volume).toDestination();
      if (filter) {
        input.connect(filter);
        filter.connect(gain);
      } else {
        input.connect(gain);
      }

      synth.connect(input);
      const foleyPlayers = new Map<string, Tone.Player>();
      for (const [timbre, source] of Object.entries(foleySourceMap)) {
        const player = new Tone.Player(source);
        player.autostart = false;
        player.fadeOut = gameConfig.audio.foley.fadeOut;
        player.connect(input);
        foleyPlayers.set(timbre, player);
      }

      return { synth, input, filter, gain, foleyPlayers };
    };

    return {
      hit: createChannel("hit"),
      wrong: createChannel("wrong"),
      reference: createChannel("reference"),
    };
  }

  /** Returns a strictly increasing Tone.js schedule time. */
  private nextTime() {
    const now = Tone.now() + gameConfig.audio.scheduleLeadTime;
    const next = Math.max(now, this.lastScheduledTime + gameConfig.audio.minimumScheduleGap);
    this.lastScheduledTime = next;
    return next;
  }
}

/** Returns true when the timbre should play through foley samples. */
function isFoleyTimbre(timbre: string) {
  return timbre in foleySourceMap;
}

/** Returns the synth configuration used for a channel style. */
function getSynthConfig(style: VoiceStyle) {
  switch (style) {
    case "hit":
      return {
        oscillator: { type: "triangle" as const },
        envelope: { ...gameConfig.audio.synth.hit.envelope },
      };
    case "wrong":
      return {
        oscillator: { type: "square" as const },
        envelope: { ...gameConfig.audio.synth.wrong.envelope },
      };
    case "reference":
      return {
        oscillator: { type: "sine" as const },
        envelope: { ...gameConfig.audio.synth.reference.envelope },
      };
  }
}

/** Returns the channel filter used to color reference and wrong notes. */
function getFilter(style: VoiceStyle) {
  switch (style) {
    case "wrong":
      return new Tone.Filter(gameConfig.audio.filters.wrongHighpassHz, "highpass");
    case "reference":
      return new Tone.Filter(gameConfig.audio.filters.referenceLowpassHz, "lowpass");
    default:
      return undefined;
  }
}

/** Returns the rhythmic duration used for a channel style. */
function getDuration(style: VoiceStyle) {
  switch (style) {
    case "hit":
      return gameConfig.audio.durations.hit;
    case "wrong":
      return gameConfig.audio.durations.wrong;
    case "reference":
      return gameConfig.audio.durations.reference;
  }
}

/** Maps instrument timbres to synthesized pitches. */
function mapTimbreToPitch(timbre: string) {
  switch (timbre) {
    case "kick":
      return gameConfig.audio.pitches.kick;
    case "snare":
      return gameConfig.audio.pitches.snare;
    case "hat":
      return gameConfig.audio.pitches.hat;
    case "clap":
      return gameConfig.audio.pitches.clap;
    case "tom":
      return gameConfig.audio.pitches.tom;
    default:
      return gameConfig.audio.pitches.default;
  }
}
