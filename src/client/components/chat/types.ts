// The conversation's outward state, and the only thing the UI reads to decide
// what to show.
// `preparing` is the gap between a reply existing and it being audible: the
// first clip takes a second or two to synthesise, and without a state of its own
// the app sat on `idle` through it, claiming to be ready while the patient
// waited on silence.
export type ConversationState = "idle" | "listening" | "thinking" | "preparing" | "speaking";
