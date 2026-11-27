import { expect, it } from "vitest";
import { assistantVoiceErrorMessage, LocalizedVoiceError } from "./assistant-voice-error";

const english = (_tr: string, en: string) => en;
const turkish = (tr: string) => tr;

it("shows an already localized composer refusal as written instead of the generic line", () => {
  // The session composer refuses recognized text while a send runs, in the owner's language.
  const refusal = new LocalizedVoiceError(turkish("Gönderim sürerken sesle yazılamaz."));
  expect(assistantVoiceErrorMessage(refusal, turkish)).toBe("Gönderim sürerken sesle yazılamaz.");
  expect(assistantVoiceErrorMessage(new LocalizedVoiceError("Wait for the current send or upload to finish."), english))
    .toBe("Wait for the current send or upload to finish.");
});

it("keeps translating known app errors and hides unknown raw text", () => {
  expect(assistantVoiceErrorMessage(new Error("Record at least a short phrase."), turkish)).toBe("En az kısa bir cümle kaydet.");
  expect(assistantVoiceErrorMessage(new Error("Gönderim sürerken sesle yazılamaz."), english)).toBe("Voice didn't work. Try again.");
  expect(assistantVoiceErrorMessage(new LocalizedVoiceError(""), english)).toBe("Voice didn't work. Try again.");
});
