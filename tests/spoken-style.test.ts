import { describe, expect, it } from "vitest";
import { parseSpoken } from "@server/controllers/chat-controller";

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
