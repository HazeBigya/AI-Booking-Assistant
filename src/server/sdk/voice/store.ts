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

let cached: VoiceStore | undefined;

export function getVoiceStore(): VoiceStore {
  cached ??= createLocalVoiceStore(process.env.VOICE_STORAGE_DIR ?? DEFAULT_ROOT);
  return cached;
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
