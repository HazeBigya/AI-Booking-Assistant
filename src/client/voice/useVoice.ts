"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationState } from "@client/components/chat/types";
import { getVoiceConfig, speak, transcribe } from "./api";
import { isCaptureSupported, startCapture } from "./capture";
import { PlaybackQueue } from "./playback";
import { toSpeakable } from "./speakable";

interface Params {
  // Receives the transcript and returns the assistant's reply, or null if the
  // turn produced nothing to say.
  onTranscript: (text: string) => Promise<string | null>;
  setState: (state: ConversationState) => void;
}

export function useVoice({ onTranscript, setState }: Params) {
  const [disabledReason, setDisabledReason] = useState<string | null>("Checking voice…");
  const [listening, setListening] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const queueRef = useRef<PlaybackQueue | null>(null);

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

  // Sentence one plays while sentence two is still being generated.
  const speakReply = useCallback(
    async (reply: string) => {
      const sentences = toSpeakable(reply);
      if (sentences.length === 0) return;
      setState("speaking");
      const queue = new PlaybackQueue(playBlob);
      queueRef.current = queue;
      sentences.forEach((sentence, i) => queue.enqueue(i, speak(sentence)));
      await queue.whenDrained();
      queueRef.current = null;
      setState("idle");
    },
    [setState],
  );

  const toggle = useCallback(async () => {
    if (listening) {
      cancelRef.current?.();
      cancelRef.current = null;
      setListening(false);
      setState("idle");
      return;
    }

    queueRef.current?.stop(); // reaching for the mic cancels the reply in flight
    setListening(true);
    setState("listening");

    try {
      cancelRef.current = await startCapture(async (blob) => {
        cancelRef.current = null;
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
    } catch {
      // Almost always a denied microphone permission.
      setDisabledReason("Microphone permission denied.");
      setListening(false);
      setState("idle");
    }
  }, [listening, onTranscript, setState, speakReply]);

  return { disabledReason, listening, toggle };
}

function playBlob(clip: Blob): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(clip);
    const audio = new Audio(url);
    const done = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.onended = done;
    audio.onerror = done; // a clip that will not decode must not stall the queue
    void audio.play().catch(done);
  });
}
