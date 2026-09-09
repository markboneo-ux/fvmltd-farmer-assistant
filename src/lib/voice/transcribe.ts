import "server-only";

import { tryCreateOpenAIClient } from "@/lib/openai/client";
import {
  CARIBBEAN_SPEECH_TRANSCRIPTION_PROMPT,
  MAX_VOICE_SECONDS,
} from "./caribbean-vocab";

export { MAX_VOICE_SECONDS };

export type TranscriptionResult =
  | { ok: true; text: string; confidence: number | null; durationSeconds: number | null }
  | { ok: false; error: string; status: number };

export async function transcribeFarmerVoice(options: {
  file: File;
  durationSeconds?: number | null;
  apiKey?: string;
}): Promise<TranscriptionResult> {
  const duration = options.durationSeconds ?? null;
  if (duration && duration > MAX_VOICE_SECONDS + 2) {
    return {
      ok: false,
      error: `Please keep the voice note under ${MAX_VOICE_SECONDS} seconds.`,
      status: 400,
    };
  }
  if (options.file.size > 8_000_000) {
    return {
      ok: false,
      error: "That voice note is too large. Please record a shorter message.",
      status: 413,
    };
  }

  const openai = tryCreateOpenAIClient(options.apiKey);
  if (!openai.ok) {
    return {
      ok: false,
      error: "Voice notes are not available right now. Please type your question.",
      status: 503,
    };
  }

  try {
    const result = await openai.client.audio.transcriptions.create({
      file: options.file,
      model: "whisper-1",
      language: "en",
      prompt: CARIBBEAN_SPEECH_TRANSCRIPTION_PROMPT,
      temperature: 0,
    });
    const text = result.text.trim();
    if (!text) {
      return {
        ok: false,
        error: "I could not hear that clearly. Please try again or type it.",
        status: 422,
      };
    }
    return {
      ok: true,
      text,
      confidence: null,
      durationSeconds: duration,
    };
  } catch {
    return {
      ok: false,
      error: "I could not transcribe that voice note. Please try again or type it.",
      status: 502,
    };
  }
}
