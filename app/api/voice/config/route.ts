import { NextResponse } from "next/server";
import { voiceStatus } from "@server/sdk/voice";

// Read the env on every request, not at build time: in Docker the key arrives
// at runtime, and a prerendered answer would report "no voice key" forever.
export const dynamic = "force-dynamic";

// The mic must be disabled up front with a reason that names the missing
// variable, rather than failing after the patient has already spoken.
export async function GET() {
  return NextResponse.json(voiceStatus());
}
