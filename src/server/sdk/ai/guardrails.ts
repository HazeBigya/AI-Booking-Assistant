// Last net: the bot must never emit code. Scope itself is enforced by the
// system prompt and tools-only actions, not by a classifier pass.
export function validateOutput(reply: string, opts: { sameTimeZone?: boolean } = {}): string {
  if (reply.includes("```")) {
    return "I can only help with the clinic's services and appointments.";
  }
  const cleaned = stripEmojis(reply);
  return opts.sameTimeZone ? stripLocalTimeClaim(cleaned) : cleaned;
}

// The prompt asks for no emojis, but low-tier models ignore soft tone rules.
function stripEmojis(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/ {2,}/g, " ") // collapse double spaces left behind
    .replace(/[ \t]+([.,!?\n])/g, "$1") // no space before punctuation/newline
    .trim();
}

// When the patient sits in the clinic's own zone, no tool result carries a
// "yourLocalTime" field — the data is not there. A sentence about their local
// time is therefore not a conversion done badly but one invented from nothing,
// and it always cancels out: "9:00 AM, and that's also 9:00 AM your local time."
//
// Three rewordings of it survived three successive prompt rules. Whether the
// patient has a second time zone is something the server knows for certain, so
// this stops being a matter of persuading a model and becomes a deletion. Same
// reasoning as stripEmojis above, and as the slot-grid check in the domain
// layer: a rule the model keeps breaking belongs in code.
const MENTIONS_LOCAL_TIME = /\byour\s+(?:own\s+)?local\s+time\b/i;

// The claim runs from its connector to the end of its sentence. Anchored on
// "also", which is the word that gives it away — it is there to present the
// same clock time as if it were a second fact.
const CLAIM =
  /\s*[,;:—–-]?\s*(?:and\s+|but\s+)?(?:that(?:'|’)s|these\s+\w+\s+are|these\s+are|those\s+are|it(?:'|’)s|this\s+is|they(?:'|’)re)?\s*\balso\b[^.!?]*/i;

function stripLocalTimeClaim(text: string): string {
  const out = text
    .split(/(?<=[.!?])\s+/)
    .map(withoutClaim)
    .filter((s) => s.length > 0)
    .join(" ");
  return out.replace(/\s+([.,!?])/g, "$1").trim();
}

function withoutClaim(sentence: string): string {
  if (!MENTIONS_LOCAL_TIME.test(sentence)) return sentence;

  const terminator = sentence.match(/[.!?]+$/)?.[0] ?? "";
  const body = sentence.slice(0, sentence.length - terminator.length);
  const kept = body.replace(CLAIM, "").trim();

  // Whether anything survived worth saying. A sentence that still names a time
  // was telling the patient something and merely had the claim tacked onto it;
  // one reduced to "These times are" existed only to carry the claim, so it
  // goes with it rather than leaving a fragment behind.
  return /\d/.test(kept) ? kept + (terminator || ".") : "";
}
