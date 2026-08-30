import { describe, expect, it } from "vitest";
import { PlaybackQueue } from "@client/voice/playback";

const clip = (tag: string) => new Blob([tag], { type: "audio/mpeg" });
const later = <T>(value: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(value), ms));

describe("PlaybackQueue", () => {
  it("plays clips in index order even when they arrive out of order", async () => {
    const played: string[] = [];
    const q = new PlaybackQueue(async (c) => {
      played.push(await c.text());
    });

    // Sentence 2 is short and its TTS returns first. It must still wait.
    q.enqueue(0, later(clip("one"), 40));
    q.enqueue(1, later(clip("two"), 5));
    q.enqueue(2, later(clip("three"), 20));

    await q.whenDrained();
    expect(played).toEqual(["one", "two", "three"]);
  });

  it("never overlaps two clips", async () => {
    let playing = 0;
    let overlapped = false;
    const q = new PlaybackQueue(async () => {
      playing++;
      if (playing > 1) overlapped = true;
      await later(null, 10);
      playing--;
    });

    q.enqueue(0, Promise.resolve(clip("a")));
    q.enqueue(1, Promise.resolve(clip("b")));
    await q.whenDrained();
    expect(overlapped).toBe(false);
  });

  // One failed sentence must not swallow the rest of the reply.
  it("skips a clip that failed to generate and plays the rest", async () => {
    const played: string[] = [];
    const q = new PlaybackQueue(async (c) => {
      played.push(await c.text());
    });

    q.enqueue(0, Promise.resolve(clip("one")));
    q.enqueue(1, Promise.reject(new Error("tts 502")));
    q.enqueue(2, Promise.resolve(clip("three")));

    await q.whenDrained();
    expect(played).toEqual(["one", "three"]);
  });

  it("stops playing anything after stop()", async () => {
    const played: string[] = [];
    const q = new PlaybackQueue(async (c) => {
      played.push(await c.text());
    });
    q.enqueue(0, later(clip("one"), 20));
    q.stop();
    await q.whenDrained();
    expect(played).toEqual([]);
  });

  // The bug this exists to prevent: stop() used to set a flag that only kept the
  // NEXT sentence from playing, while the clip already sounding ran to its end —
  // straight into a microphone the patient had just opened, so the assistant
  // recorded herself and answered her own question.
  it("silences the clip that is already playing", async () => {
    let interrupted = false;
    let released: (() => void) | undefined;

    const queue = new PlaybackQueue(
      () =>
        new Promise<void>((resolve) => {
          released = resolve;
        }),
      () => {
        interrupted = true;
        released?.(); // a paused clip ends where it was
      },
    );

    queue.enqueue(0, Promise.resolve(new Blob(["one"])));
    await Promise.resolve();
    await Promise.resolve();

    queue.stop();
    expect(interrupted).toBe(true);
    await expect(queue.whenDrained()).resolves.toBeUndefined();
  });

  // A reply where every sentence failed is a reply nobody heard, and the text
  // sitting on screen makes it look as though the voice simply never came.
  // Nothing else in the pipeline would have told the patient.
  it("reports that nothing was heard when every clip fails", async () => {
    const queue = new PlaybackQueue(async () => {});
    queue.enqueue(0, Promise.reject(new Error("413")));
    queue.enqueue(1, Promise.reject(new Error("502")));
    await queue.whenDrained();
    expect(queue.outcome()).toEqual({ played: 0, failed: 2 });
  });

  it("counts a partial failure as partly heard", async () => {
    const queue = new PlaybackQueue(async () => {});
    queue.enqueue(0, Promise.resolve(new Blob(["one"])));
    queue.enqueue(1, Promise.reject(new Error("502")));
    await queue.whenDrained();
    expect(queue.outcome()).toEqual({ played: 1, failed: 1 });
  });
});
