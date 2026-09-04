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

// Chunks are merged up to roughly this length before being sent to TTS. It is
// not about latency — it is about prosody. Each chunk is a separate request, and
// a speech model has no memory of the clip before, so it re-picks its pace every
// time: a reply split into six short sentences comes back sounding like six
// different people, speeding up and slowing down at random. Fewer, fuller chunks
// give it enough text to settle into one delivery. The cost is that the first
// clip takes slightly longer, which is a fair trade against sounding erratic.
const MIN_CHUNK_CHARS = 140;

// The speak route refuses anything longer than 1200 characters, and a chunk is
// only ever that long when the reply had no sentence endings to split on — a
// table, a list, a wall of text. Rejected, it produced no sound at all, and a
// patient cannot tell "the voice is broken" from "the voice is slow". Capping
// here keeps the failure impossible rather than merely reported. Set below the
// route's limit so the two can drift a little without meeting.
const MAX_CHUNK_CHARS = 1000;

export function splitSentences(text: string, minChars = MIN_CHUNK_CHARS): string[] {
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

  return mergeShort(raw, minChars).flatMap(capLength);
}

export function toSpeakable(text: string, minChars = MIN_CHUNK_CHARS): string[] {
  return splitSentences(stripMarkdown(text), minChars);
}

// Split at a space, so a word is never sawn in half and read as two.
function capLength(chunk: string): string[] {
  if (chunk.length <= MAX_CHUNK_CHARS) return [chunk];
  const out: string[] = [];
  let rest = chunk;
  while (rest.length > MAX_CHUNK_CHARS) {
    const window = rest.slice(0, MAX_CHUNK_CHARS);
    const cut = window.lastIndexOf(" ");
    const at = cut > MAX_CHUNK_CHARS / 2 ? cut : MAX_CHUNK_CHARS;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
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
