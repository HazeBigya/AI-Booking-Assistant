// Who the clinic sounds like.
//
// The brief rejected "a mechanical voice from Google Translate", and picking a
// better model does not on its own fix that — a good voice reading flatly still
// sounds like a machine. So the receptionist is described once, here, and each
// vendor renders that description in whatever dialect it speaks: OpenAI takes a
// sentence of direction, ElevenLabs takes numbers that loosen its delivery.
// Keeping them in one file is what stops the two vendors drifting into two
// different people.
//
// Female, warm and unhurried is a deliberate choice, not a default: this is the
// voice of a person a patient is about to trust with a dental appointment, and
// clipped efficiency reads as a queue system.

// OpenAI's gpt-4o-mini-tts takes plain-English delivery direction.
//
// Note what this asks for and what it does not. An earlier version asked for
// "brisk and confident", which produced someone working through a queue: fast
// is not the same as helpful, and a receptionist who sounds efficient sounds
// like she wants you off the phone. Warmth is the whole point, so the direction
// is about attitude — glad you called — and never about speed.
export const SPEAKING_STYLE =
  "Speak as a warm, genuinely friendly female dental receptionist who is glad " +
  "the patient called and has time for them. Bright and welcoming, with a smile " +
  "in the voice, and patient rather than efficient — never sound like you are " +
  "working through a queue or hurrying to finish. Relaxed natural pace. Let " +
  "dates, times and prices land clearly, because the patient is writing them " +
  "down.";

// The voice's own natural pace. Pushed to 1.12 once and it read as impatient —
// on a warm voice, speed is the first thing that turns helpful into hurried, so
// this stays at 1.0 unless someone has listened to the alternative. Both vendors
// take the same multiplier, which is why it is set in one place.
export const SPEAKING_RATE = 1.0;

// ElevenLabs has no instruction field; delivery is shaped by these instead.
// Stability below the midpoint lets the reading vary sentence to sentence,
// which is what stops it sounding recited; too far down and it wanders. `style`
// is the closest thing here to the warmth asked for above — enough expression
// to sound like a person, short of theatrical.
export const ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.8,
  style: 0.4,
  use_speaker_boost: true,
  speed: SPEAKING_RATE,
};
