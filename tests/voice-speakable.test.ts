import { describe, expect, it } from "vitest";
import { splitSentences, stripMarkdown, toSpeakable } from "@server/sdk/voice/speakable";

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
  it("splits on sentence terminators", () => {
    expect(splitSentences("Kate is free from 11:30. Want me to book it?")).toEqual([
      "Kate is free from 11:30.",
      "Want me to book it?",
    ]);
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
    expect(toSpeakable("**Kate** is free at 11:30. Shall I book it?")).toEqual([
      "Kate is free at 11:30.",
      "Shall I book it?",
    ]);
  });
});
