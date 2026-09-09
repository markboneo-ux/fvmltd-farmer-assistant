import { describe, expect, it } from "vitest";
import {
  CARIBBEAN_AG_VOCABULARY,
  CARIBBEAN_SPEECH_TRANSCRIPTION_PROMPT,
} from "./caribbean-vocab";

describe("Caribbean speech transcription hint", () => {
  it("includes local crop and farm words without mapping them to a diagnosis", () => {
    expect(CARIBBEAN_AG_VOCABULARY).toEqual(
      expect.arrayContaining(["melongene", "bodi", "dasheen", "ochro", "patch", "bearing"]),
    );
    expect(CARIBBEAN_SPEECH_TRANSCRIPTION_PROMPT.toLowerCase()).toMatch(/do not assume tomato/);
    expect(CARIBBEAN_SPEECH_TRANSCRIPTION_PROMPT.toLowerCase()).not.toMatch(/this means blight/);
  });
});
