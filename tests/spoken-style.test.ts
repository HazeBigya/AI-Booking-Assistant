import { describe, expect, it } from "vitest";
import { parseSpoken } from "@server/controllers/chat-controller";
import { SPOKEN_STYLE } from "@server/services/chat-service";

// A reply that will be heard is worded differently from one that is read. The
// flag saying which is a hint about phrasing and nothing else, so anything
// other than a literal true is treated as "they are reading".
describe("parseSpoken", () => {
  it("is false when the client says nothing", () => {
    expect(parseSpoken({ message: "hi" })).toBe(false);
  });

  it("is true only for a real boolean", () => {
    expect(parseSpoken({ spoken: true })).toBe(true);
    expect(parseSpoken({ spoken: "true" })).toBe(false);
    expect(parseSpoken({ spoken: 1 })).toBe(false);
  });

  it("survives junk payloads instead of throwing", () => {
    expect(parseSpoken(null)).toBe(false);
    expect(parseSpoken("spoken")).toBe(false);
    expect(parseSpoken(undefined)).toBe(false);
  });
});

// The spoken reply is not only heard — it is also rendered on screen, in the
// same bubble a typed reply would use. So a rule that helps the ear at the
// screen's expense is a bad trade: TTS reads "$150" correctly anyway, and the
// spelled-out version was the whole reason a price list came out as prose.
describe("SPOKEN_STYLE", () => {
  it("asks for figures rather than words", () => {
    expect(SPOKEN_STYLE).toMatch(/figures/i);
    expect(SPOKEN_STYLE).toMatch(/\$150/);
  });

  // The bug that prompted this: fifteen start times recited in a row.
  it("refuses to recite a long list", () => {
    expect(SPOKEN_STYLE).toMatch(/never read a long list out/i);
  });

  // Speech cannot show an address, so it has to be read back before the code
  // is sent — a misheard one produces silence, not an error.
  it("keeps the email read-back, which only speech needs", () => {
    expect(SPOKEN_STYLE).toMatch(/read\s+the email address back/i);
  });
});
