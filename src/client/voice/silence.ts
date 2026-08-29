// Auto-endpointing: notice the patient stopped talking and close the turn for
// them. This is the difference between a conversation and a walkie-talkie.
//
// Pure on purpose. Tuning these numbers is the fiddliest part of voice — too
// sensitive cuts people off mid-sentence, too dull adds dead air — and tuning
// against a test is far cheaper than tuning against a microphone.

export interface SilenceOptions {
  threshold?: number;   // RMS level counted as speech (0..1)
  silenceMs?: number;   // quiet needed after speech to end the turn
  minSpeechMs?: number; // speech shorter than this was a cough, not a turn
  maxMs?: number;       // hard stop, so a stuck mic cannot record forever
}

export const DEFAULT_SILENCE: Required<SilenceOptions> = {
  threshold: 0.02,
  silenceMs: 800,
  minSpeechMs: 300,
  maxMs: 30_000,
};

export type SilenceVerdict = "listening" | "speaking" | "done";

export class SilenceDetector {
  private readonly opts: Required<SilenceOptions>;
  private startedAt: number | null = null;
  private speechMs = 0;
  private lastLoudAt: number | null = null;
  private lastAt: number | null = null;

  constructor(opts: SilenceOptions = {}) {
    this.opts = { ...DEFAULT_SILENCE, ...opts };
  }

  reset(): void {
    this.startedAt = null;
    this.speechMs = 0;
    this.lastLoudAt = null;
    this.lastAt = null;
  }

  push(level: number, atMs: number): SilenceVerdict {
    this.startedAt ??= atMs;
    const delta = this.lastAt === null ? 0 : Math.max(0, atMs - this.lastAt);
    this.lastAt = atMs;

    if (level >= this.opts.threshold) {
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
    if (level >= this.opts.threshold) return "speaking";
    return spokeEnough ? "speaking" : "listening";
  }
}
