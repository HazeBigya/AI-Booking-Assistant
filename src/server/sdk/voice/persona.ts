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

// Model and voice are one choice, not two, and they interact: nova turns cold
// and authoritative on tts-1-hd while sounding fine on tts-1, and shimmer is the
// opposite — the extra fidelity is what carries its brightness. So neither of
// these is independently "the good one", and swapping either alone changes who
// answers the phone. Both were picked by listening to the pairs.
export const OPENAI_TTS_MODEL = "tts-1-hd";

// shimmer over nova. Nova is warm but level, and level across a front desk reads
// as indifferent; shimmer is bright and glad you called, which is the difference
// between a receptionist people tolerate and one they want to talk to. tts-1-hd
// has no direction field, so the voice carries the entire personality.
export const OPENAI_VOICE = "shimmer";

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
