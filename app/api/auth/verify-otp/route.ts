import { NextResponse, type NextRequest } from "next/server";
import { verifyOtp } from "@server/auth/otp";
import { findOrCreatePatient } from "@server/auth/patients";
import { SESSION_COOKIE, createSessionToken } from "@server/auth/session";

export async function POST(req: NextRequest) {
  let body: { email?: unknown; code?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { email, code } = body;
  if (typeof email !== "string" || typeof code !== "string") {
    return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
  }

  if (!(await verifyOtp(email, code))) {
    return NextResponse.json({ error: "Invalid or expired code." }, { status: 401 });
  }

  const patient = await findOrCreatePatient(email, email.split("@")[0]);
  const token = await createSessionToken({ email: patient.email, name: patient.name });

  const res = NextResponse.json({ ok: true, name: patient.name, email: patient.email });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
