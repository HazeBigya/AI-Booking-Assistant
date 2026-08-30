// Vendor-neutral. The routes import only these, so a new speech vendor drops in
// behind the interface the same way a new LLM drops in behind LLMProvider.

export interface SpokenAudio {
  audio: Uint8Array;
  mimeType: string; // what to hand the browser's <audio>, e.g. 'audio/mpeg'
}

export interface SpeechToText {
  readonly name: string;
  transcribe(audio: Uint8Array, mimeType: string): Promise<string>;
}

export interface TextToSpeech {
  readonly name: string;
  speak(text: string): Promise<SpokenAudio>;
}
