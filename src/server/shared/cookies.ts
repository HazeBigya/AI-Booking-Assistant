// One definition of how this app's cookies are set, because the session cookie
// is the only thing standing between a patient's appointments and anyone else,
// and four separate copies of its flags is four chances for one to drift.

export interface CookieOptions {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
}

// `secure` is conditional rather than always on: a browser silently discards a
// secure cookie sent over plain HTTP, so hardcoding true would break every
// localhost login, and hardcoding false would send a session token in the clear
// the moment this is deployed. NODE_ENV is the one signal available in both.
export function sessionCookie(maxAgeSeconds: number): CookieOptions {
  return {
    httpOnly: true, // scripts cannot read it, so an XSS cannot steal the session
    sameSite: "lax", // not sent on cross-site POSTs, which is the CSRF path
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  };
}

export const A_WEEK = 60 * 60 * 24 * 7;
export const A_MONTH = 60 * 60 * 24 * 30;
