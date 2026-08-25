// Output guardrail (last net): the bot must never emit code; strip-and-refuse
// if it tries. Scope is enforced by the system prompt + tools-only actions, so
// no separate intent-classification pass runs on the hot path.
export function validateOutput(reply: string): string {
  if (reply.includes("```")) {
    return "I can only help with the clinic's dental services and appointments.";
  }
  return stripEmojis(reply);
}

// Deterministically remove emojis. The system prompt asks the model not to use
// them, but low-tier models ignore soft tone rules — so we enforce it in code,
// then tidy up the whitespace they leave behind.
function stripEmojis(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/ {2,}/g, " ") // collapse double spaces left behind
    .replace(/[ \t]+([.,!?\n])/g, "$1") // no space before punctuation/newline
    .trim();
}
