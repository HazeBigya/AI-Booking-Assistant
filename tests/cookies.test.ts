import { afterEach, describe, expect, it, vi } from "vitest";
import { A_WEEK, sessionCookie } from "@server/shared/cookies";

afterEach(() => {
  vi.unstubAllEnvs();
});

// This cookie is the whole of the app's authentication — it is what proves a
// request may read someone's appointments — so its flags are worth pinning
// rather than trusting four hand-written copies to stay in step.
describe("sessionCookie", () => {
  it("is unreadable by scripts and not sent cross-site", () => {
    const c = sessionCookie(A_WEEK);
    expect(c.httpOnly).toBe(true); // an XSS cannot read the session
    expect(c.sameSite).toBe("lax"); // closes the CSRF path
    expect(c.path).toBe("/");
    expect(c.maxAge).toBe(A_WEEK);
  });

  it("refuses plain HTTP in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookie(A_WEEK).secure).toBe(true);
  });

  // A secure cookie is silently dropped over http, so localhost would never log
  // anyone in — which is why this is conditional rather than simply always on.
  it("allows it in development, where there is no TLS to use", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookie(A_WEEK).secure).toBe(false);
  });
});
