import { isNativeApp } from "@/lib/mobile/native";

/**
 * Ensure microphone access is requested before MediaRecorder starts.
 * On web this is the normal getUserMedia prompt; on native shells the
 * Info.plist / AndroidManifest strings drive the system dialog.
 */
export async function ensureMicrophoneAccess(): Promise<
  { ok: true; stream: MediaStream } | { ok: false; error: string }
> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      error: "I could not access the microphone. Please type your question.",
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return { ok: true, stream };
  } catch {
    return {
      ok: false,
      error: isNativeApp()
        ? "Please allow microphone access for FVM Crop Solution in your phone settings, then try again."
        : "I could not access the microphone. Please type your question.",
    };
  }
}
