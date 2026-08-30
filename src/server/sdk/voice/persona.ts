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
export const SPEAKING_STYLE =
  "Speak as a warm, friendly female dental receptionist: brisk and confident " +
  "but never clipped, with a slight smile in the voice. Move at the pace of " +
  "someone who knows the answer — a little quicker than a newsreader, never " +
  "sing-song. Still let dates, times and prices land clearly, because the " +
  "patient is writing them down.";

// A touch above natural. Default pace reads as hesitant on a phone-style
// exchange, where the patient already knows what they asked. Both vendors take
// a multiplier where 1.0 is the voice's own speed, so the same number means the
// same thing on either — which is the point of setting it in one place.
export const SPEAKING_RATE = 1.12;

// ElevenLabs has no instruction field; delivery is shaped by these instead.
// Stability below the midpoint lets the reading vary sentence to sentence,
// which is what stops it sounding recited; too far down and it wanders.
export const ELEVENLABS_VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.8,
  style: 0.35,
  use_speaker_boost: true,
  speed: SPEAKING_RATE,
};
