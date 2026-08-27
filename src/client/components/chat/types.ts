// The conversation's outward state. Voice (listening/speaking) is presentation
// only today; the STT/TTS engine plugs in behind this same union.
export type ConversationState = "idle" | "listening" | "thinking" | "speaking";
