// Last net: the bot must never emit code. Scope itself is enforced by the
// system prompt and tools-only actions, not by a classifier pass.
export function validateOutput(reply: string): string {
  if (reply.includes("```")) {
    return "I can only help with the clinic's dental services and appointments.";
  }
  return stripEmojis(reply);
}

// The prompt asks for no emojis, but low-tier models ignore soft tone rules.
function stripEmojis(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/ {2,}/g, " ") // collapse double spaces left behind
    .replace(/[ \t]+([.,!?\n])/g, "$1") // no space before punctuation/newline
    .trim();
}
