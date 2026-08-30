import { describe, expect, it } from "vitest";
import { splitSentences, stripMarkdown, toSpeakable } from "@client/voice/speakable";

describe("stripMarkdown", () => {
  it("removes emphasis without eating the words", () => {
    expect(stripMarkdown("**Kate** is *free* at `11:30`")).toBe("Kate is free at 11:30");
  });

  it("turns list bullets into plain clauses", () => {
    expect(stripMarkdown("- Cleaning\n- Whitening")).toBe("Cleaning\nWhitening");
  });

  it("keeps a link's text and drops its url", () => {
    expect(stripMarkdown("see [our services](https://x.test/s)")).toBe("see our services");
  });

  it("drops heading markers", () => {
    expect(stripMarkdown("## Services")).toBe("Services");
  });
});

describe("splitSentences", () => {
  // minChars is passed explicitly here so these assert where the boundaries are.
  // The default merges far past them on purpose — see the prosody tests below.
  it("splits on sentence terminators", () => {
    expect(splitSentences("Kate is free from 11:30. Want me to book it?", 1)).toEqual([
      "Kate is free from 11:30.",
      "Want me to book it?",
    ]);
  });

  // Each chunk is its own TTS request and the model has no memory of the last
  // one, so it re-picks its pace every time. Six short sentences came back
  // sounding like six different people; merging is what makes it one.
  it("merges short sentences into one chunk by default", () => {
    const reply = "Kate does both. She's free at 9. It ends at 10. Shall I book it?";
    expect(splitSentences(reply)).toEqual([reply]);
  });

  it("still breaks a long reply so the first clip is not the whole thing", () => {
    const long = `${"Kate has a gap in the diary tomorrow morning at nine. ".repeat(9)}Shall I take it?`;
    const chunks = splitSentences(long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toBe(long.trim());
  });

  // toSpeakable is what the browser actually calls, and it once carried its own
  // default — so the merge threshold was tuned in a function nothing used.
  it("applies the same merging through toSpeakable", () => {
    const reply = "Kate does both. She's free at 9. It ends at 10.";
    expect(toSpeakable(reply)).toEqual(splitSentences(reply));
    expect(toSpeakable(reply)).toHaveLength(1);
  });

  // The whole reason this is not a one-line regex.
  it("does not split on a title abbreviation", () => {
    expect(splitSentences("Dr. Kate has an opening tomorrow morning.")).toEqual([
      "Dr. Kate has an opening tomorrow morning.",
    ]);
  });

  it("does not split on a.m. / p.m.", () => {
    expect(splitSentences("It starts at 11:30 a.m. and runs an hour.")).toEqual([
      "It starts at 11:30 a.m. and runs an hour.",
    ]);
  });

  it("keeps an unterminated tail", () => {
    expect(splitSentences("no terminator here")).toEqual(["no terminator here"]);
  });

  it("returns nothing for blank input", () => {
    expect(splitSentences("   ")).toEqual([]);
  });

  // A two-word chunk is not worth its own HTTP request and sounds clipped.
  it("merges a chunk shorter than minChars into the next one", () => {
    expect(splitSentences("Sure. Kate is free from 11:30 tomorrow.", 12)).toEqual([
      "Sure. Kate is free from 11:30 tomorrow.",
    ]);
  });

  it("merges a short tail backwards so nothing is dropped", () => {
    expect(splitSentences("Kate is free from 11:30 tomorrow. OK?", 12)).toEqual([
      "Kate is free from 11:30 tomorrow. OK?",
    ]);
  });
});

describe("toSpeakable", () => {
  it("strips then splits", () => {
    // minChars of 1 to see the boundaries; the default would merge these two.
    expect(toSpeakable("**Kate** is free at 11:30. Shall I book it?", 1)).toEqual([
      "Kate is free at 11:30.",
      "Shall I book it?",
    ]);
  });
});
