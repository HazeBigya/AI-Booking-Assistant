import { describe, it, expect } from "vitest";
import { rateLimit } from "@server/shared/rate-limit";

const uniqueKey = () => `test-${Math.random()}`;

describe("rateLimit", () => {
  it("allows up to max, then blocks", () => {
    const key = uniqueKey();
    expect(rateLimit(key, { max: 2, windowMs: 60_000 }).allowed).toBe(true);
    expect(rateLimit(key, { max: 2, windowMs: 60_000 }).allowed).toBe(true);
    expect(rateLimit(key, { max: 2, windowMs: 60_000 }).allowed).toBe(false);
  });

  it("keeps separate keys independent", () => {
    const a = uniqueKey();
    const b = uniqueKey();
    rateLimit(a, { max: 1 });
    expect(rateLimit(a, { max: 1 }).allowed).toBe(false);
    expect(rateLimit(b, { max: 1 }).allowed).toBe(true);
  });

  it("resets once the window has passed", () => {
    const key = uniqueKey();
    // windowMs -1 => the bucket is already expired, so each call starts fresh.
    expect(rateLimit(key, { max: 1, windowMs: -1 }).allowed).toBe(true);
    expect(rateLimit(key, { max: 1, windowMs: -1 }).allowed).toBe(true);
  });
});
