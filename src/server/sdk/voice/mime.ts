// Speech APIs decide how to decode an upload from its filename extension more
// often than from its bytes, and the browser only ever tells us a mime type.
// Shared so every STT connector names the same recording the same way.
export function extensionFor(mimeType: string): string {
  const base = mimeType.split(";")[0].trim();
  const known: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
  };
  return known[base] ?? "webm";
}
