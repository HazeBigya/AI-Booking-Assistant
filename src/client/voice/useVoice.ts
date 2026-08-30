"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { ConversationState } from "@client/components/chat/types";
import { getVoiceConfig, speak, transcribe } from "./api";
import { isCaptureSupported, startCapture, type Capture } from "./capture";
import { PlaybackQueue } from "./playback";
import { toSpeakable } from "./speakable";

interface Params {
  // Receives the transcript and returns the assistant's reply, or null if the
  // turn produced nothing to say.
  onTranscript: (text: string) => Promise<string | null>;
  setState: (state: ConversationState) => void;
  // Told when speech fails outright. The reply is on screen either way, so this
  // is not fatal — but silence with no explanation reads as a broken product,
  // and the patient has no way to tell it from a voice that is merely slow.
  onError: (message: string) => void;
}

export function useVoice({ onTranscript, setState, onError }: Params) {
  const [disabledReason, setDisabledReason] = useState<string | null>("Checking voice…");
  const [listening, setListening] = useState(false);
  // The reply currently being turned into audio, so the message it belongs to
  // can show that it is working. Matching on the text rather than an index keeps
  // this right whether the speech was started by the microphone or by pressing
  // Listen on an older reply.
  const [spokenText, setSpokenText] = useState<string | null>(null);
  const captureRef = useRef<Capture | null>(null);
  const queueRef = useRef<PlaybackQueue | null>(null);
  // The clip currently audible. Pausing the queue is not enough to create
  // silence — this is the thing making the noise.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Bumped whenever speech is superseded — stopped, or replaced by a new reply.
  // The run that was cancelled still finishes its await and reaches its cleanup
  // a tick later, by which time the patient may already be recording; without
  // this it resets the state to idle underneath them, and the interface shows an
  // idle microphone while the recorder is genuinely running.
  const speechRun = useRef(0);
  // getUserMedia can sit on a permission prompt for as long as the patient takes
  // to answer it. A press during that window has nothing to stop yet, so it is
  // recorded here and honoured the moment the recorder exists — otherwise the
  // button says idle and the microphone opens anyway.
  const abandonStart = useRef(false);

  useEffect(() => {
    if (!isCaptureSupported()) {
      setDisabledReason("This browser can't record audio.");
      return;
    }
    getVoiceConfig()
      .then((cfg) => {
        // Both halves or nothing. Never fall back to the browser's robot voice:
        // a silent downgrade ships the exact thing the brief rejected.
        if (cfg.stt && cfg.tts) setDisabledReason(null);
        else setDisabledReason(cfg.reason ?? "Add a voice API key to enable the mic.");
      })
      .catch(() => setDisabledReason("Voice unavailable."));
  }, []);

  // Leaving on a live turn discards it rather than sending it: nobody is left to
  // hear the answer. Without this the microphone stays open and the browser's
  // recording indicator stays lit after the conversation is gone.
  useEffect(
    () => () => {
      captureRef.current?.cancel();
      queueRef.current?.stop();
    },
    [],
  );

  // Silence, immediately. Used both when the patient reaches for the microphone
  // — otherwise the assistant's own voice goes down the open mic and comes back
  // as their next question — and by the control they press to cut her off.
  const stopSpeaking = useCallback(() => {
    speechRun.current++;
    queueRef.current?.stop();
    queueRef.current = null;
    setSpokenText(null);
    setState("idle");
  }, [setState]);

  // Sentence one plays while sentence two is still being generated.
  const speakReply = useCallback(
    async (reply: string) => {
      const sentences = toSpeakable(reply);
      if (sentences.length === 0) return;

      // 'preparing' until sound actually arrives, then 'speaking'. Announcing
      // 'speaking' up front was a lie for as long as the first clip took to
      // synthesise, and leaving it on 'idle' was worse — the app claimed to be
      // ready while the patient sat through silence wondering if it had heard.
      const run = ++speechRun.current;
      setState("preparing");
      setSpokenText(reply);
      const queue = new PlaybackQueue(
        async (clip) => {
          setState("speaking");
          await playBlob(clip, audioRef);
        },
        () => silence(audioRef),
      );
      queueRef.current = queue;
      sentences.forEach((sentence, i) => queue.enqueue(i, speak(sentence)));
      try {
        await queue.whenDrained();
      } finally {
        // Only tidy up if this run is still the current one. Anything else has
        // already set the state it wants and must not be overwritten.
        if (speechRun.current === run) {
          const { played, failed } = queue.outcome();
          // Losing a sentence is survivable; losing all of them is a reply the
          // patient never heard, and nothing else would have told them.
          if (played === 0 && failed > 0) {
            onError("I couldn't read that reply out loud — it's written above.");
          }
          queueRef.current = null;
          setSpokenText(null);
          setState("idle");
        }
      }
    },
    [onError, setState],
  );

  const toggle = useCallback(async () => {
    if (listening) {
      // Send what was said, do not discard it. Pressing the mic to finish is
      // how someone ends a turn on purpose instead of waiting out the silence
      // timer, and throwing the audio away there loses the whole question.
      if (captureRef.current) {
        captureRef.current.stop();
        captureRef.current = null;
      } else {
        // Still waiting on the microphone permission prompt.
        abandonStart.current = true;
        setListening(false);
        setState("idle");
      }
      return;
    }

    stopSpeaking(); // never record the assistant answering herself
    abandonStart.current = false;
    setListening(true);
    setState("listening");

    try {
      const capture = await startCapture(async (blob) => {
        captureRef.current = null;
        setListening(false);
        setState("thinking");
        try {
          const text = await transcribe(blob);
          if (!text) {
            setState("idle"); // heard nothing worth sending to the model
            return;
          }
          const reply = await onTranscript(text);
          if (reply) await speakReply(reply);
          else setState("idle");
        } catch {
          setState("idle");
        }
      });
      // Pressed again while the prompt was up: honour it now the mic is real.
      if (abandonStart.current) {
        capture.cancel();
        return;
      }
      captureRef.current = capture;
    } catch {
      // Almost always a denied microphone permission.
      setDisabledReason("Microphone permission denied.");
      setListening(false);
      setState("idle");
    }
  }, [listening, onTranscript, setState, speakReply, stopSpeaking]);

  // Reading a reply aloud on request. A typed question is answered in text and
  // stays silent — someone who is reading did not ask to be talked at — but the
  // same reply is one tap from being spoken, which is what a patient who typed
  // and then looked away actually needs.
  const speakText = useCallback(
    async (text: string) => {
      stopSpeaking(); // a second tap replaces the reply in flight
      // Deliberately does not set the global 'thinking' state: that disables the
      // composer, and replaying an old reply must not stop someone typing the
      // next question. The button spins on its own instead.
      await speakReply(text);
    },
    [speakReply, stopSpeaking],
  );

  return { disabledReason, listening, toggle, speakText, spokenText, stopSpeaking };
}

function playBlob(clip: Blob, ref: MutableRefObject<HTMLAudioElement | null>): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(clip);
    const audio = new Audio(url);
    ref.current = audio;
    const done = () => {
      URL.revokeObjectURL(url);
      if (ref.current === audio) ref.current = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done; // a clip that will not decode must not stall the queue
    // Pausing resolves nothing on its own, so an interrupted clip ends here.
    audio.onpause = done;
    void audio.play().catch(done);
  });
}

function silence(ref: MutableRefObject<HTMLAudioElement | null>): void {
  ref.current?.pause();
  ref.current = null;
}
