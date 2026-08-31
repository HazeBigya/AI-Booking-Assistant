import { describe, expect, it } from "vitest";
import { DEFAULT_SILENCE, SilenceDetector, type SilenceVerdict } from "@client/voice/silence";

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

  // The pause someone takes mid-thought, or between clauses in a language they
  // are still learning, must not be read as the end of their turn: being cut
  // off loses the whole question, while waiting loses a second.
  it("does not end the turn on a pause of a second and a half", () => {
    const det = new SilenceDetector();
    expect(
      feed(det, [
        [0.2, 0],
        [0.2, 400],
        [0.001, 500],
        [0.001, 1900],
      ]),
    ).not.toBe("done");
    // Still the same turn once they carry on.
    expect(det.push(0.2, 2000)).toBe("speaking");
  });

  it("defaults to a pause long enough for a hesitant speaker", () => {
    expect(DEFAULT_SILENCE.silenceMs).toBeGreaterThanOrEqual(1500);
  });
});

// The failure this prevents does not look like a threshold problem from the
// outside. A room noisier than the fixed floor keeps refreshing "last heard
// sound", so silence never arrives and the turn runs to maxMs — thirty seconds
// of a microphone that will not switch off after the patient stopped talking.
describe("adapting to the room", () => {
  it("ends the turn in a room whose hum sits above the fixed floor", () => {
    const hum = 0.03; // above threshold 0.02, so a fixed floor hears it forever
    const det = new SilenceDetector();
    // 300ms of room, measured.
    for (let t = 0; t < 300; t += 50) det.push(hum, t);
    // Speech, then the patient stops and only the hum is left.
    for (let t = 300; t < 900; t += 50) det.push(0.25, t);
    let verdict: SilenceVerdict = "speaking";
    for (let t = 900; t <= 3000 && verdict !== "done"; t += 50) verdict = det.push(hum, t);
    expect(verdict).toBe("done");
  });

  it("still hears an ordinary voice when the room is measured mid-sentence", () => {
    const det = new SilenceDetector();
    // Nothing quiet to calibrate against: the patient is already talking.
    let verdict: SilenceVerdict = "listening";
    for (let t = 0; t < 600; t += 50) verdict = det.push(0.25, t);
    expect(verdict).toBe("speaking");
  });

  // A silent room must not make the detector hair-trigger on a breath.
  it("never drops below the fixed floor", () => {
    const det = new SilenceDetector();
    for (let t = 0; t < 300; t += 50) det.push(0.0001, t);
    expect(det.push(0.01, 350)).toBe("listening");
  });
});
