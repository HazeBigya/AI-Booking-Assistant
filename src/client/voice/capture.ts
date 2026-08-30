import { SilenceDetector } from "./silence";

// The browser half of endpointing: one MediaStream feeds two consumers —
// MediaRecorder produces the bytes, AnalyserNode produces the volume that
// SilenceDetector reads to decide the turn is over.

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function isCaptureSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator?.mediaDevices?.getUserMedia === "function" &&
    typeof window.MediaRecorder !== "undefined"
  );
}

export interface Capture {
  stop(): void; // ends the turn and sends what was said
  cancel(): void; // ends the turn and throws it away
}

// Resolves once recording has started. Silence ends the turn on its own, but a
// patient must also be able to end it deliberately — waiting out a timer is not
// an interaction, and someone who has finished should not have to sit still to
// prove it.
export async function startCapture(onDone: (blob: Blob) => void): Promise<Capture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const audioCtx = new AudioContext();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  const detector = new SilenceDetector();
  let frame = 0;
  let finished = false;

  const finish = (emit: boolean) => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    // Release the mic immediately: leaving it live keeps the browser's
    // recording indicator on and holds the device against other tabs.
    stream.getTracks().forEach((t) => t.stop());
    void audioCtx.close();
    if (!emit) chunks.length = 0;
    if (recorder.state !== "inactive") recorder.stop();
  };

  recorder.onstop = () => {
    if (chunks.length > 0) onDone(new Blob(chunks, { type: recorder.mimeType }));
  };

  const started = performance.now();
  const tick = () => {
    analyser.getFloatTimeDomainData(samples);
    if (detector.push(rms(samples), performance.now() - started) === "done") {
      finish(true);
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  recorder.start(250); // chunk often so stopping never loses the tail
  frame = requestAnimationFrame(tick);

  return { stop: () => finish(true), cancel: () => finish(false) };
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}
