import { NextResponse, type NextRequest } from "next/server";
import { createOtp } from "@server/auth/otp";

export async function POST(req: NextRequest) {
  let email: unknown;
  try {
    email = (await req.json())?.email;
  } catch {
    email = undefined;
  }
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const code = await createOtp(email);
  // Dev: no email provider wired, so print to the server console. In production
  // this would be sent via an email service.
  console.log(`[DEV OTP] ${email} -> ${code}`);
  return NextResponse.json({ ok: true });
}
