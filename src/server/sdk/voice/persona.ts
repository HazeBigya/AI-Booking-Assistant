// Who the clinic sounds like.
//
// The brief rejected "a mechanical voice from Google Translate", and picking a
// better model does not on its own fix that. It can make it worse: gpt-4o-mini-
// tts accepts written delivery direction and tts-1-hd is the higher-fidelity
// render, and both came out sounding like someone processing a queue. tts-1
// with nova sounds like a person who is pleased you called. Warmth is not a
// resolution problem, so this is settled by listening, not by spec sheets.
//
// These are pinned rather than configurable. Which voice the clinic has is a
// decision, like its opening hours, not something that differs between
// deployments — and offering it as a setting would mean nobody ever chose.

// Model and voice are one choice, not two: nova on tts-1 is the combination
// that was picked, and tts-1-hd renders the same voice as authoritative rather
// than friendly. Changing either changes who answers the phone. Also the
// cheapest of the three, which is a coincidence rather than a reason.
export const OPENAI_TTS_MODEL = "tts-1";
export const OPENAI_VOICE = "nova";

// 'Rachel' — a warm female stock voice present on every ElevenLabs account, so
// the connector matches the same receptionist without anyone browsing a library.
export const ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

// ElevenLabs shapes delivery through numbers rather than a voice choice alone.
// Stability below the midpoint lets the reading vary sentence to sentence,
// which is what stops it sounding recited; too far down and it wanders. `style`
// is the closest thing here to warmth — enough expression to sound like a
// person, short of theatrical. No speed setting: the natural pace is the warm
// one, and every attempt to hurry it read as impatience.
export const ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.8,
  style: 0.4,
  use_speaker_boost: true,
};
