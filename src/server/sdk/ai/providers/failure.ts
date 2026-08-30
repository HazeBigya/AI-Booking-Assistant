// Why the model call failed, and whether waiting will help.
//
// This exists because of how the app is meant to be used. "Bring your own AI"
// means the first thing a new operator does is put an unfamiliar model name in
// .env — and the first thing they see if it is wrong is a chat window saying
// "please try again in a moment", which is false. They retry, it fails
// identically, and they conclude the app is broken rather than that they typed
// a model the vendor does not offer.

export type FailureKind = "config" | "transient";

export interface ProviderFailure {
  kind: FailureKind;
  status?: number;
  detail: string;
}

// 401/403: the key. 404: the model name. 400: the request shape — usually an
// option this model does not accept. None of these improve by waiting.
// Everything else, including 429 and 5xx, is worth another try.
const CONFIG_STATUSES = new Set([400, 401, 403, 404]);

export function classifyFailure(err: unknown): ProviderFailure {
  const e = err as {
    status?: number;
    error?: { message?: string };
    message?: string;
    cause?: unknown;
  };
  const status = typeof e?.status === "number" ? e.status : undefined;
  const detail = e?.error?.message ?? e?.message ?? String(err);
  return {
    kind: status !== undefined && CONFIG_STATUSES.has(status) ? "config" : "transient",
    status,
    detail,
  };
}

// One line a person can act on, instead of forty lines of minified stack. The
// vendor's own wording is kept verbatim: it named the exact parameter last time,
// which no message written here could have predicted.
export function describeFailure(where: string, err: unknown): string {
  const { kind, status, detail } = classifyFailure(err);
  const code = status ? ` (HTTP ${status})` : "";
  if (kind === "transient") {
    return `[llm] ${where} is unreachable${code}: ${detail}`;
  }
  return (
    `[llm] ${where} rejected the request${code}: ${detail}\n` +
    `[llm] This will not fix itself by retrying — check AI_PROVIDER, the model name ` +
    `and that vendor's API key in .env.`
  );
}
