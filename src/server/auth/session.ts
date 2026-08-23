import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-only-insecure-secret-change-me",
);

export const SESSION_COOKIE = "session";

export interface Session {
  email: string;
  name: string;
}

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT({ email: session.email, name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

// Returns the session only if the token is valid and unexpired — this is what
// proves the caller owns the email, so appointment lookups can trust it.
export async function readSessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.email === "string" && typeof payload.name === "string") {
      return { email: payload.email, name: payload.name };
    }
    return null;
  } catch {
    return null;
  }
}
