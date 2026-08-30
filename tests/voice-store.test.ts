import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalVoiceStore, getVoiceStore, resetVoiceStore } from "@server/sdk/voice/store";

const TOUCHED = ["VOICE_SAVE_RECORDINGS", "VOICE_STORAGE_DIR"];

let dir: string;
let saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "voice-store-"));
  saved = Object.fromEntries(TOUCHED.map((k) => [k, process.env[k]]));
  for (const k of TOUCHED) delete process.env[k];
  resetVoiceStore();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetVoiceStore();
});

describe("createLocalVoiceStore", () => {
  it("writes the audio under the session id and returns the path", async () => {
    const store = createLocalVoiceStore(dir);
    const path = await store.save("sess-1", new Uint8Array([1, 2, 3]), "audio/webm");
    expect(path).toContain("sess-1");
    expect(path?.endsWith(".webm")).toBe(true);
    expect([...(await readFile(path!))]).toEqual([1, 2, 3]);
  });

  // A debug artifact must never break the request the patient is waiting on.
  it("returns null instead of throwing when the path is unwritable", async () => {
    const store = createLocalVoiceStore("/proc/nonexistent-voice-root");
    expect(await store.save("sess-1", new Uint8Array([1]), "audio/webm")).toBeNull();
  });

  it("refuses a session id that would escape the root", async () => {
    const store = createLocalVoiceStore(dir);
    expect(await store.save("../../etc", new Uint8Array([1]), "audio/webm")).toBeNull();
  });
});

// The transcript is already the record of the turn. Keeping the patient's voice
// as well is a debugging choice someone has to make on purpose.
describe("getVoiceStore", () => {
  it("keeps nothing unless recordings are explicitly enabled", async () => {
    process.env.VOICE_STORAGE_DIR = dir;
    expect(await getVoiceStore().save("sess-1", new Uint8Array([1]), "audio/webm")).toBeNull();
  });

  it("writes to disk once VOICE_SAVE_RECORDINGS is set", async () => {
    process.env.VOICE_STORAGE_DIR = dir;
    process.env.VOICE_SAVE_RECORDINGS = "1";
    resetVoiceStore();
    const path = await getVoiceStore().save("sess-1", new Uint8Array([1]), "audio/webm");
    expect(path).toContain("sess-1");
  });
});
