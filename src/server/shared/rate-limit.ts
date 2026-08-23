// In-memory fixed-window rate limit. Single-instance only; Redis is the scale
// path (documented in the README). Per-key window so different call sites can
// set their own limits (chat vs OTP request vs OTP verify).
const DEFAULT_MAX = 20;
const DEFAULT_WINDOW_MS = 60_000;

const hits = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitOptions {
  max?: number;
  windowMs?: number;
}

export function rateLimit(
  key: string,
  opts: RateLimitOptions = {},
): { allowed: boolean; retryAfterMs: number } {
  const max = opts.max ?? DEFAULT_MAX;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (entry.count >= max) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}
