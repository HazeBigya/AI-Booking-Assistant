import { describe, expect, it } from "vitest";
import { VoiceError, configFailure, httpFailure } from "@server/sdk/voice/failure";

describe("httpFailure", () => {
  // The real one. ElevenLabs refuses a library voice on a free key at request
  // time, with no advance signal — and the browser was told "Could not generate
  // speech", which sounds like a bug rather than a setting.
  it("keeps the vendor's sentence out of ElevenLabs' envelope", async () => {
    const res = new Response(
      JSON.stringify({
        detail: {
          type: "payment_required",
          code: "paid_plan_required",
          message: "Free users cannot use library voices via the API.",
        },
      }),
      { status: 402 },
    );
    const err = await httpFailure("ElevenLabs TTS", res);
    expect(err.status).toBe(402);
    expect(err.message).toBe(
      "ElevenLabs TTS failed (402): Free users cannot use library voices via the API.",
    );
  });

  it("reads Deepgram's err_msg", async () => {
    const res = new Response(JSON.stringify({ err_msg: "project does not have access" }), {
      status: 403,
    });
    expect((await httpFailure("Deepgram TTS", res)).message).toContain(
      "project does not have access",
    );
  });

  // An html error page from a proxy is not JSON, and losing the status because
  // of it would be worse than a truncated body.
  it("falls back to the raw body when it is not JSON", async () => {
    const err = await httpFailure(
      "ElevenLabs TTS",
      new Response("<html>502</html>", { status: 502 }),
    );
    expect(err.status).toBe(502);
    expect(err.message).toContain("<html>502</html>");
  });
});

describe("configFailure", () => {
  it("names a plan restriction, because retrying will never clear it", () => {
    expect(configFailure(new VoiceError("ElevenLabs TTS failed (402): upgrade", 402))).toBe(
      "ElevenLabs TTS failed (402): upgrade",
    );
  });

  it("names a bad key for the same reason", () => {
    expect(configFailure(new VoiceError("bad key", 401))).toBe("bad key");
  });

  // Duck-typed on `status`, so an SDK's own error object classifies without
  // being wrapped — OpenAI's APIError carries the field already.
  it("classifies an error that is not a VoiceError", () => {
    expect(configFailure(Object.assign(new Error("model not found"), { status: 404 }))).toBe(
      "model not found",
    );
  });

  it("says nothing about a rate limit, which does clear", () => {
    expect(configFailure(new VoiceError("slow down", 429))).toBeUndefined();
  });

  it("says nothing about a vendor outage", () => {
    expect(configFailure(new VoiceError("bad gateway", 502))).toBeUndefined();
  });

  // A dropped connection has no status at all, and guessing "your settings are
  // wrong" at a network blip sends the reader to edit a correct .env.
  it("says nothing about an error with no status", () => {
    expect(configFailure(new Error("fetch failed"))).toBeUndefined();
    expect(configFailure("boom")).toBeUndefined();
  });
});
