import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalVoiceStore } from "@server/sdk/voice/store";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "voice-store-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
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
