// What to say when a speech vendor refuses.
//
// The routes previously answered every refusal with "Could not generate
// speech." while the vendor's actual sentence — "Free users cannot use library
// voices via the API" — went only to the server log. That is a fixable settings
// problem presented as a broken feature: the one person who could fix it is the
// one person not shown the reason.

export class VoiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VoiceError";
  }
}

// Every vendor buries its explanation somewhere different, so this reads the
// response once and keeps the sentence rather than the envelope.
export async function httpFailure(what: string, res: Response): Promise<VoiceError> {
  const body = await res.text().catch(() => "");
  const detail = vendorMessage(body) ?? body.slice(0, 200);
  return new VoiceError(`${what} failed (${res.status}): ${detail}`, res.status);
}

function vendorMessage(body: string): string | undefined {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return undefined; // html error page, empty body, plain text
  }
  // ElevenLabs nests it under `detail`, Deepgram uses `err_msg`, most use one
  // of the other two.
  const detail = json.detail as { message?: unknown } | undefined;
  for (const candidate of [detail?.message, json.message, json.err_msg, json.error]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

// Rate limits and timeouts are the 4xx that genuinely clear on their own.
const RETRYABLE = new Set([408, 429]);

// Returns the vendor's own words when the failure is a settings problem — a
// wrong key, a voice the plan does not include, a model id that was renamed.
// Those read identically on every retry, so "try again in a moment" is the one
// answer guaranteed to waste the reader's time. Undefined means it may well be
// transient, and the generic message is the honest one.
//
// Duck-typed on `status` rather than on VoiceError, so an SDK's own error
// object (OpenAI's APIError carries the same field) classifies for free.
export function configFailure(err: unknown): string | undefined {
  const status = statusOf(err);
  if (status === undefined || status < 400 || status >= 500) return undefined;
  if (RETRYABLE.has(status)) return undefined;
  return err instanceof Error ? err.message : String(err);
}

function statusOf(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null | undefined)?.status;
  return typeof status === "number" ? status : undefined;
}
