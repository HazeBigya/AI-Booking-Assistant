import { describe, expect, it } from "vitest";
import { SilenceDetector } from "@client/voice/silence";

// Feed a series of [level, ms] samples and return the last verdict.
function feed(det: SilenceDetector, samples: [number, number][]) {
  let last = "listening";
  for (const [level, at] of samples) last = det.push(level, at);
  return last;
}

describe("SilenceDetector", () => {
  it("stays listening while nobody has spoken yet", () => {
    const det = new SilenceDetector();
    expect(
      feed(det, [
        [0.001, 0],
        [0.001, 100],
        [0.001, 5000],
      ]),
    ).toBe("listening");
  });

  it("reports speaking once the level crosses the threshold", () => {
    const det = new SilenceDetector({ threshold: 0.02 });
    expect(
      feed(det, [
        [0.001, 0],
        [0.2, 100],
      ]),
    ).toBe("speaking");
  });

  it("ends the turn after the silence window closes", () => {
    const det = new SilenceDetector({ threshold: 0.02, silenceMs: 800, minSpeechMs: 200 });
    expect(
      feed(det, [
        [0.2, 0],
        [0.2, 300], // 300ms of speech, past minSpeechMs
        [0.001, 400],
        [0.001, 900],
        [0.001, 1050], // 750ms since the last loud sample: not yet
      ]),
    ).toBe("speaking");
    expect(det.push(0.001, 1150)).toBe("done"); // 850ms since the last loud sample
  });

  // A cough or a door is not a turn. Ending on it would send noise to the STT.
  it("ignores a blip shorter than minSpeechMs", () => {
    const det = new SilenceDetector({ threshold: 0.02, silenceMs: 800, minSpeechMs: 300 });
    expect(
      feed(det, [
        [0.2, 0],
        [0.2, 100],
        [0.001, 200],
        [0.001, 1200],
      ]),
    ).toBe("listening");
  });

  it("restarts the silence window when speech resumes", () => {
    const det = new SilenceDetector({ threshold: 0.02, silenceMs: 800, minSpeechMs: 100 });
    feed(det, [
      [0.2, 0],
      [0.2, 200],
      [0.001, 300],
      [0.001, 900],
    ]); // 600ms quiet
    expect(det.push(0.2, 1000)).toBe("speaking"); // spoke again
    expect(det.push(0.001, 1500)).toBe("speaking"); // only 500ms
    expect(det.push(0.001, 1900)).toBe("done"); // 900ms
  });

  // Without this a stuck-open mic records until the tab dies.
  it("ends the turn at maxMs even if the level never drops", () => {
    const det = new SilenceDetector({ threshold: 0.02, minSpeechMs: 100, maxMs: 2000 });
    expect(
      feed(det, [
        [0.2, 0],
        [0.2, 1999],
      ]),
    ).toBe("speaking");
    expect(det.push(0.2, 2001)).toBe("done");
  });

  it("is reusable after reset", () => {
    const det = new SilenceDetector({ threshold: 0.02, silenceMs: 100, minSpeechMs: 10 });
    feed(det, [
      [0.2, 0],
      [0.2, 50],
      [0.001, 60],
      [0.001, 200],
    ]);
    det.reset();
    expect(det.push(0.001, 300)).toBe("listening");
  });
});
