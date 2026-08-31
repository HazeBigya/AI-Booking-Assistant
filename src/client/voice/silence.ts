// Auto-endpointing: notice the patient stopped talking and close the turn for
// them. This is the difference between a conversation and a walkie-talkie.
//
// Pure on purpose. Tuning these numbers is the fiddliest part of voice — too
// sensitive cuts people off mid-sentence, too dull adds dead air — and tuning
// against a test is far cheaper than tuning against a microphone.

// prettier-ignore
export interface SilenceOptions {
  threshold?: number;    // floor RMS counted as speech (0..1), before the room
  silenceMs?: number;    // quiet needed after speech to end the turn
  minSpeechMs?: number;  // speech shorter than this was a cough, not a turn
  maxMs?: number;        // hard stop, so a stuck mic cannot record forever
  noiseWindowMs?: number; // opening stretch measured as the room by itself
  noiseMargin?: number;   // how far above that floor speech has to be
}

// silenceMs is generous on purpose. 800ms is roughly the pause inside a fluent
// native sentence, so it cut people off between clauses — and it punished
// exactly the patients least able to absorb it: anyone speaking a second
// language, anyone elderly, anyone thinking about a date. Being interrupted
// mid-question costs the whole question; waiting costs the wait, and the mic
// button ends the turn immediately for anyone who does not want to wait at all.
// 1600ms is the tightest value that still clears a hesitation of a second and a
// half, which is the pause that prompted raising it in the first place.
export const DEFAULT_SILENCE: Required<SilenceOptions> = {
  threshold: 0.02,
  silenceMs: 1600,
  minSpeechMs: 300,
  maxMs: 30_000,
  noiseWindowMs: 300,
  noiseMargin: 2.5,
};

// A fixed threshold assumes a quiet room. A fan, a laptop fan close to the mic,
// or the browser's own gain control can hold the level above 0.02 for the whole
// turn — and then the detector never sees silence at all, so the turn does not
// end when the patient stops talking. It ends at maxMs, thirty seconds later,
// which reads as a microphone that will not switch off rather than a threshold
// that is too low.
//
// So the opening moments of a turn, before anyone has said anything, are taken
// as a measurement of the room, and speech has to be a clear multiple of that.
// Clamped at both ends: never below the fixed floor, so a silent room does not
// make it hair-trigger, and never so high that ordinary speech (0.1–0.3) stops
// registering if the patient talks over the measurement.
const MAX_ADAPTIVE_THRESHOLD = 0.08;

export type SilenceVerdict = "listening" | "speaking" | "done";

export class SilenceDetector {
  private readonly opts: Required<SilenceOptions>;
  private startedAt: number | null = null;
  private speechMs = 0;
  private lastLoudAt: number | null = null;
  private lastAt: number | null = null;
  private noiseFloor = 0;

  constructor(opts: SilenceOptions = {}) {
    this.opts = { ...DEFAULT_SILENCE, ...opts };
  }

  reset(): void {
    this.startedAt = null;
    this.speechMs = 0;
    this.lastLoudAt = null;
    this.lastAt = null;
    this.noiseFloor = 0;
  }

  // What counts as speech in this room, rather than in a quiet one.
  private get speechLevel(): number {
    const adapted = this.noiseFloor * this.opts.noiseMargin;
    return Math.min(Math.max(this.opts.threshold, adapted), MAX_ADAPTIVE_THRESHOLD);
  }

  push(level: number, atMs: number): SilenceVerdict {
    this.startedAt ??= atMs;
    const delta = this.lastAt === null ? 0 : Math.max(0, atMs - this.lastAt);
    this.lastAt = atMs;

    // Measure the room only while it is still the room: the opening stretch,
    // and only until something loud enough to be speech has been heard.
    if (this.lastLoudAt === null && atMs - this.startedAt < this.opts.noiseWindowMs) {
      this.noiseFloor = Math.max(this.noiseFloor, level);
    }

    if (level >= this.speechLevel) {
      this.speechMs += delta;
      this.lastLoudAt = atMs;
    }

    // Quiet before anyone has spoken is a patient thinking, not a finished
    // turn, so minSpeechMs gates 'done' only — never the live feedback below.
    const spokeEnough = this.speechMs >= this.opts.minSpeechMs;
    if (spokeEnough) {
      if (atMs - this.startedAt >= this.opts.maxMs) return "done";
      // Measured from the last loud sample, not the first quiet one: that is
      // the last moment sound was actually observed.
      if (this.lastLoudAt !== null && atMs - this.lastLoudAt >= this.opts.silenceMs) return "done";
    }
    // Sound arriving right now, so the orb lights up before the turn is over.
    if (level >= this.speechLevel) return "speaking";
    return spokeEnough ? "speaking" : "listening";
  }
}
