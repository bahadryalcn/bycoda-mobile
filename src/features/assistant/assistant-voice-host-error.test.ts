import { describe, expect, it } from "vitest";
import { HostWsError } from "@/remote/ws-connection";
import { assistantCallErrorMessage, assistantCallLinkDropped, AssistantCallError } from "./assistant-call-error";
import { assistantVoiceErrorMessage } from "./assistant-voice-error";
import { voiceHostMessage } from "./assistant-voice-host-error";
import { voiceNativeMessage } from "./assistant-voice-native-error";

const english = (_tr: string, en: string, values?: Record<string, string | number>) => en.replace("{p0}", String(values?.p0));
const turkish = (tr: string, _en: string, values?: Record<string, string | number>) => tr.replace("{p0}", String(values?.p0));
/** What the phone's socket raises for a voice refusal the computer explained. */
const refused = (reason: string) => new HostWsError("unavailable", false, undefined, false, undefined, undefined, reason);

describe("voice refusals from the computer", () => {
  // The owner saw "Bilgisayar bu isteğe hazır değil" whenever the desktop already ran voice with other settings.
  it("names the computer's reason instead of the generic not-ready sentence", () => {
    const error = refused("Voice settings changed. Disconnect voice in other windows before reconnecting.");
    expect(assistantVoiceErrorMessage(error, english)).toBe(
      "The computer is using voice with other settings. End voice on the computer and try again, or update bycoda on the computer so this phone can join it.");
    expect(assistantCallErrorMessage(error, turkish)).toContain("başka ayarlarla");
    expect(assistantVoiceErrorMessage(refused("Voice setup is still running."), english)).toBe(
      "Voice setup is still running on the computer. Try again when it finishes.");
  });

  it("lists missing voice files and points to the computer's voice settings", () => {
    const error = refused("Voice setup is incomplete: faster-whisper, Whisper model. Open Settings → Voice assistant. Choose Locate existing to find installed voice files, or Install to get missing files.");
    expect(voiceHostMessage(error, english)).toBe(
      "Voice is not set up on the computer (missing: faster-whisper, Whisper model). On the computer, open Settings → Voice assistant and install the missing files.");
  });

  it("shows an unknown computer reason under a localized summary and keeps the generic line without one", () => {
    expect(voiceHostMessage(refused("OpenRouter is not signed in."), english)).toBe("The computer couldn't use voice."+String.fromCharCode(10)+"OpenRouter is not signed in.");
    expect(voiceHostMessage(new HostWsError("unavailable"), english)).toBeUndefined();
    expect(assistantVoiceErrorMessage(new HostWsError("unavailable"), english)).toBe("This computer is not ready for this request. Try again shortly.");
  });

  it("wraps the reason under an app failure heading", () => {
    const error = new AssistantCallError("not-started", refused("A voice model action is running."));
    expect(assistantCallErrorMessage(error, english)).toBe(
      "The voice call could not start.\nA voice model is being installed or removed on the computer. Try again when it finishes.");
  });

  it("asks to update the computer when its socket cannot carry phone voice", () => {
    expect(assistantVoiceErrorMessage(new HostWsError("unsupported"), english)).toBe("Update bycoda on the computer to use voice from this phone.");
  });

  // A refusal repeated for two and a half minutes of automatic reopening before the call reported it.
  it("does not reopen a call the computer refused for a stated reason", () => {
    expect(assistantCallLinkDropped(refused("Voice setup is still running."), "connect")).toBe(false);
    expect(assistantCallLinkDropped(refused("Voice connection expired. Start voice again."), "connect")).toBe(true);
    expect(assistantCallLinkDropped(new HostWsError("unavailable"), "connect")).toBe(true);
    expect(assistantCallLinkDropped(new HostWsError("network"), "transcription")).toBe(true);
  });
});

describe("phone voice module failures", () => {
  it("translates the module's reason inside Expo's rejection wrapper", () => {
    const error = new Error("Call to function 'BycodaVoiceCompanion.startCapture' has been rejected.\n→ Caused by: Microphone could not start.");
    expect(voiceNativeMessage(error, english)).toBe("The phone's microphone could not start. Close other apps using the microphone, then try again.");
    expect(assistantVoiceErrorMessage(error, english)).toBe("The phone's microphone could not start. Close other apps using the microphone, then try again.");
    expect(assistantCallErrorMessage(new Error("Audio is in use by another app. Try voice again when it is available."), english))
      .toBe("Another app is using the phone's audio. Close it, then try again.");
  });

  it("leaves unrelated errors to the shared presenters", () => {
    expect(voiceNativeMessage(new Error("Model file missing"), english)).toBeUndefined();
  });
});
