import { expect, it } from "vitest";
import { dictationEngineKind, spokenLanguage } from "./dictation-engine";

// The computer's recognizer guessed the language of every clip; it now gets the owner's as a fallback.
it("names the chosen app language, else the phone's first language, as the spoken language", () => {
  expect(spokenLanguage("tr", ["en-US"])).toBe("tr");
  expect(spokenLanguage("system", ["tr-TR", "en-US"])).toBe("tr-TR");
  // A phone language the app is not translated into is still the language the owner speaks.
  expect(spokenLanguage("system", ["it-IT", "en-US"])).toBe("it-IT");
  expect(spokenLanguage(undefined, ["en-GB"])).toBe("en-GB");
  expect(spokenLanguage("system", [])).toBeUndefined();
});

it("recognizes on this phone only when the owner chose it", () => {
  expect(dictationEngineKind({ phoneDictation: true })).toBe("phone");
  expect(dictationEngineKind({ phoneDictation: false })).toBe("computer");
});
