import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

// Recordings are debug artifacts — "it heard 'Kate' as 'eight'" — and demo
// replay material. Nothing in the request path reads them back, so losing the
// directory loses nothing. The interface exists so S3 is a swap, not a rewrite.
export interface VoiceStore {
  save(sessionId: string, audio: Uint8Array, mimeType: string): Promise<string | null>;
}

const DEFAULT_ROOT = "storage/voice";

export function createLocalVoiceStore(rootDir: string = DEFAULT_ROOT): VoiceStore {
  const root = resolve(rootDir);
  return {
    async save(sessionId, audio, mimeType) {
      try {
        const dir = resolve(root, sessionId);
        // The session id arrives from a cookie. Keep it inside the root.
        if (dir !== root && !dir.startsWith(root + sep)) return null;
        await mkdir(dir, { recursive: true });
        const path = join(dir, `${Date.now()}.${extensionFor(mimeType)}`);
        await writeFile(path, audio);
        return path;
      } catch (err) {
        // Never fail a transcription over a debug artifact.
        console.warn("voice store write failed:", err instanceof Error ? err.message : err);
        return null;
      }
    },
  };
}

// Keeping nothing is the honest default. The transcript is already the record
// of the turn, stored as an ordinary chat message, so a recording adds no
// product value — it only adds a patient's voice sitting on a disk with no
// retention policy and no deletion path. Worth having while tuning the
// endpointing, which is why it is one env var away rather than deleted.
export function createNullVoiceStore(): VoiceStore {
  return {
    async save() {
      return null;
    },
  };
}

let cached: VoiceStore | undefined;

// Tests only: the cache would otherwise outlive an env change.
export function resetVoiceStore(): void {
  cached = undefined;
}

export function getVoiceStore(): VoiceStore {
  cached ??= recordingsEnabled()
    ? createLocalVoiceStore(process.env.VOICE_STORAGE_DIR ?? DEFAULT_ROOT)
    : createNullVoiceStore();
  return cached;
}

function recordingsEnabled(): boolean {
  return process.env.VOICE_SAVE_RECORDINGS === "1";
}

function extensionFor(mimeType: string): string {
  const base = mimeType.split(";")[0].trim();
  const known: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/wav": "wav",
  };
  return known[base] ?? "bin";
}
