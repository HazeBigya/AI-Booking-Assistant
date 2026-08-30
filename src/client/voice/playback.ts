// Sentence one plays while sentence two is still being generated. That is the
// entire latency trick, and it only works if sentence two can never overtake
// sentence one — which it otherwise would, because a short sentence comes back
// from TTS faster than a long one.

export type PlayFn = (clip: Blob) => Promise<void>;

export class PlaybackQueue {
  private readonly pending = new Map<number, Promise<Blob>>();
  private next = 0;
  private played = 0;
  private failed = 0;
  private draining: Promise<void> = Promise.resolve();
  private stopped = false;

  // `interrupt` silences whatever is audible right now. Without it, stop() only
  // prevents the NEXT sentence: the clip already playing runs to its end, which
  // is how the assistant's own voice ended up recorded as the patient's answer.
  constructor(
    private readonly play: PlayFn,
    private readonly interrupt?: () => void,
  ) {}

  enqueue(index: number, clip: Promise<Blob>): void {
    // Swallow-and-rethrow now: an unrejected promise sitting in the map until
    // the drain loop reaches it would surface as an unhandled rejection first.
    const tracked = clip.catch((err) => Promise.reject(err));
    tracked.catch(() => {});
    this.pending.set(index, tracked);
    this.draining = this.draining.then(() => this.drain());
  }

  whenDrained(): Promise<void> {
    return this.draining;
  }

  // Skipping a dead sentence keeps the rest of the reply alive, but skipping
  // every sentence is a reply nobody heard — and from the patient's side that
  // is indistinguishable from a voice that simply never arrived.
  outcome(): { played: number; failed: number } {
    return { played: this.played, failed: this.failed };
  }

  stop(): void {
    this.stopped = true;
    this.pending.clear();
    this.interrupt?.();
  }

  private async drain(): Promise<void> {
    while (!this.stopped) {
      const clip = this.pending.get(this.next);
      if (!clip) return; // the next sentence has not been requested yet
      this.pending.delete(this.next);
      this.next++;
      try {
        const blob = await clip;
        if (this.stopped) return;
        await this.play(blob);
        this.played++;
      } catch (err) {
        this.failed++;
        // One dead sentence must not swallow the rest of the reply.
        console.warn("skipping unplayable sentence:", err instanceof Error ? err.message : err);
      }
    }
  }
}
