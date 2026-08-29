// A TTS model reads what it is given. Hand it raw markdown and it says
// "asterisk asterisk Kate"; hand it a whole reply and the patient waits in
// silence for all of it. Both problems are solved before any audio exists.

// Periods that end a word here are not sentence boundaries. Lowercased, and
// stored without the trailing dot so multi-dot forms like "a.m" match too.
// prettier-ignore
const ABBREVIATIONS = new Set([
  "dr", "mr", "mrs", "ms", "prof", "st", "approx", "no", "vs", "etc",
  "e.g", "i.e", "a.m", "p.m",
]);

// prettier-ignore
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")          // fenced code: unspeakable
    .replace(/`([^`]*)`/g, "$1")              // inline code: keep the words
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")    // images: nothing to say
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")  // links: say the text, not the url
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")       // headings
    .replace(/^\s{0,3}[-*+]\s+/gm, "")        // bullets
    .replace(/^\s{0,3}>\s?/gm, "")            // blockquotes
    .replace(/(\*\*|__)(.*?)\1/g, "$2")       // bold
    .replace(/(\*|_)(.*?)\1/g, "$2")          // italic
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

export function splitSentences(text: string, minChars = 12): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const raw: string[] = [];
  let start = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (!".!?".includes(trimmed[i])) continue;
    // A boundary needs whitespace or end-of-string after it, otherwise it is a
    // decimal point, a url, or a version number.
    const next = trimmed[i + 1];
    if (next !== undefined && !/\s/.test(next)) continue;
    if (endsWithAbbreviation(trimmed.slice(start, i))) continue;
    raw.push(trimmed.slice(start, i + 1).trim());
    start = i + 1;
  }
  const tail = trimmed.slice(start).trim();
  if (tail) raw.push(tail);

  return mergeShort(raw, minChars);
}

export function toSpeakable(text: string, minChars = 12): string[] {
  return splitSentences(stripMarkdown(text), minChars);
}

function endsWithAbbreviation(chunk: string): boolean {
  const lastWord = chunk.split(/\s/).pop() ?? "";
  return ABBREVIATIONS.has(lastWord.toLowerCase().replace(/\.$/, ""));
}

// A two-word chunk costs a whole HTTP round trip and sounds clipped, so glue it
// to a neighbour. Forward first; a short final chunk has to go backwards.
function mergeShort(chunks: string[], minChars: number): string[] {
  const out: string[] = [];
  let pending = "";
  for (const chunk of chunks) {
    const merged = pending ? `${pending} ${chunk}` : chunk;
    if (merged.length < minChars) {
      pending = merged;
      continue;
    }
    out.push(merged);
    pending = "";
  }
  if (pending) {
    if (out.length > 0) out[out.length - 1] += ` ${pending}`;
    else out.push(pending);
  }
  return out;
}
