import { errorMessage } from "@/ui/error-message";
import { HostWsError } from "@/remote/ws-connection";
import { RemoteHostError } from "@/remote/host-error";
import type { AssistantVoiceStage } from "./assistant-voice-presentation";
import { voiceHostMessage, voiceHostRefused } from "./assistant-voice-host-error";
import { voiceNativeMessage } from "./assistant-voice-native-error";

/** Why a voice call stopped or could not start. Screens translate the code; the English message is for logs and tests. */
export type AssistantCallFailure =
  | "unlock" | "message-pending" | "native-unavailable" | "connection-changed" | "send-unreviewed"
  | "project-unverified" | "project-unavailable" | "result-unknown" | "reply-refused" | "reply-hidden" | "stopped" | "no-speech" | "not-started"
  | "audio-taken" | "idle-timeout" | "microphone-failed" | "app-closed";

/**
 * Why the phone's voice service ended a call on its own. The owner's own Stop needs no explanation;
 * every other end used to close the call with no word about what happened.
 */
export function companionEndFailure(reason: string | undefined): AssistantCallFailure | undefined {
  switch (reason) {
    case "audio-interrupted": return "audio-taken";
    case "timeout": return "idle-timeout";
    case "capture-error": return "microphone-failed";
    case "task-removed": case "destroyed": return "app-closed";
    case "unavailable": return "not-started";
    default: return undefined;
  }
}

const english: Record<AssistantCallFailure, string> = {
  unlock: "Open and unlock this assistant conversation before starting a call.",
  "message-pending": "Wait for the current conversation message before starting a call.",
  "native-unavailable": "This version doesn't support voice calls. Update the app.",
  "connection-changed": "The computer connection changed. Start the call again.",
  "send-unreviewed": "Review the previous assistant message result before starting a call.",
  "project-unverified": "Project access must be verified on your computer before continuing this call.",
  "project-unavailable": "The assistant project is no longer available.",
  "result-unknown": "The message result is unknown. Review it in the conversation before speaking again.",
  "reply-refused": "The computer did not accept the message. Speak again.",
  "reply-hidden": "The reply cannot be read with the current project access.",
  stopped: "Call stopped.",
  "no-speech": "No speech was detected. Start the call again when ready.",
  "not-started": "The voice call could not start.",
  "audio-taken": "Another app took the phone's audio, so the call stopped.",
  "idle-timeout": "The call closed after three minutes without speech.",
  "microphone-failed": "The phone's microphone stopped working during the call.",
  "app-closed": "The call ended because bycoda was closed.",
};

/** A call failure the app itself raised, identified by `reason` instead of by its wording. */
export class AssistantCallError extends Error {
  /** `detail` is the underlying failure, shown under the reason so the owner can tell what went wrong. */
  constructor(readonly reason: AssistantCallFailure, readonly detail?: unknown) { super(english[reason]); this.name = "AssistantCallError"; }
}

type Copy = (turkish: string, english: string, values?: Record<string, string | number>) => string;

function reasonMessage(reason: AssistantCallFailure, copy: Copy): string {
  switch (reason) {
    case "unlock": return copy("Görüşmeyi başlatmadan önce bu asistan konuşmasını aç ve kilidini çöz.", english[reason]);
    case "message-pending": return copy("Görüşmeyi başlatmadan önce konuşmadaki mevcut mesajın bitmesini bekle.", english[reason]);
    case "native-unavailable": return copy("Bu sürüm sesli görüşmeyi desteklemiyor. Uygulamayı güncelle.", english[reason]);
    case "connection-changed": return copy("Bilgisayar bağlantısı değişti. Görüşmeyi yeniden başlat.", english[reason]);
    case "send-unreviewed": return copy("Görüşmeyi başlatmadan önce önceki asistan mesajının sonucunu kontrol et.", english[reason]);
    case "project-unverified": return copy("Bu görüşmeye devam etmeden önce proje erişimi bilgisayarında doğrulanmalı.", english[reason]);
    case "project-unavailable": return copy("Asistan projesi artık kullanılamıyor.", english[reason]);
    case "result-unknown": return copy("Mesajın sonucu bilinmiyor. Tekrar konuşmadan önce konuşmada kontrol et.", english[reason]);
    case "reply-refused": return copy("Bilgisayar mesajı kabul etmedi. Yeniden konuş.", english[reason]);
    case "reply-hidden": return copy("Yanıt, mevcut proje erişimiyle okunamıyor.", english[reason]);
    case "stopped": return copy("Görüşme durduruldu.", english[reason]);
    case "no-speech": return copy("Konuşma algılanmadı. Hazır olduğunda görüşmeyi yeniden başlat.", english[reason]);
    case "not-started": return copy("Sesli görüşme başlatılamadı.", english[reason]);
    case "audio-taken": return copy("Başka bir uygulama telefonun sesini aldı; görüşme durdu.", english[reason]);
    case "idle-timeout": return copy("Üç dakika konuşma olmadığı için görüşme kapandı.", english[reason]);
    case "microphone-failed": return copy("Görüşme sırasında telefonun mikrofonu çalışmayı bıraktı.", english[reason]);
    case "app-closed": return copy("bycoda kapatıldığı için görüşme bitti.", english[reason]);
  }
}

/** The idle limit is a normal end of listening: the call sleeps instead of reporting a failure. */
export function assistantCallSleeps(error: unknown): boolean {
  return error instanceof AssistantCallError && (error.reason === "no-speech" || error.reason === "idle-timeout");
}

/**
 * The wait for a sent message's reply ran out (the phone's own wait or the computer's) while the line
 * stayed up: the message reached the computer and the assistant may still be working on it. Unlike a
 * dropped connection, its receipt can be read on the same line until the reply is ready.
 */
export function assistantReplyOverdue(error: unknown): boolean {
  return error instanceof HostWsError && error.category === "deadline";
}

/** One sentence for an unknown send result: why it is unknown, and where to look. */
function unknownResultMessage(detail: unknown, copy: Copy): string {
  if (assistantReplyOverdue(detail))
    return copy("Yanıt beklenenden uzun sürdü; asistan hâlâ çalışıyor olabilir. Sonucu konuşmada gör.",
      "The reply is taking longer than expected; the assistant may still be working on it. See the result in the conversation.");
  const dropped = detail instanceof HostWsError ? detail.uncertain || detail.category === "network"
    : detail instanceof RemoteHostError && detail.kind === "network";
  if (dropped)
    return copy("Mesaj gönderilirken bağlantı kesildi; sonucu bilinmiyor. Tekrar konuşmadan önce konuşmada kontrol et.",
      "The connection dropped while the message was sent, so its result is unknown. Check it in the conversation before speaking again.");
  const reason = reasonMessage("result-unknown", copy);
  return detail === undefined ? reason : `${reason}\n${voiceDetailMessage(detail, copy)}`;
}

/**
 * The voice line to the computer dropped while nothing was in flight that could have changed the
 * computer (listening, transcription or speech). Such a call can be reopened automatically; a dropped
 * send cannot, because its result is unknown.
 */
export function assistantCallLinkDropped(error: unknown, stage?: AssistantVoiceStage): boolean {
  if (stage === "reply") return false;
  // The computer answered with a reason (voice setup running, settings in use): reopening would repeat it.
  if (voiceHostRefused(error)) return false;
  if (error instanceof HostWsError) return error.uncertain || error.category === "network" || error.category === "unavailable";
  if (error instanceof RemoteHostError) return error.uncertain || error.kind === "network";
  return false;
}

/**
 * A voice failure that is not the app's own reason: the computer's stated voice reason, the phone voice
 * module's reason, or the shared presenter's wording for everything else.
 */
function voiceDetailMessage(error: unknown, copy: Copy): string {
  if (error instanceof HostWsError && error.category === "unsupported")
    return copy("Bu telefondan ses kullanmak için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on the computer to use voice from this phone.");
  return voiceHostMessage(error, copy) ?? voiceNativeMessage(error, copy) ?? errorMessage(error, copy);
}

/**
 * The text under a voice-call failure heading. The app's own failures are translated by reason; every
 * other error (Host-vetted, already redacted details included) goes through the shared presenter unchanged.
 */
export function assistantCallErrorMessage(error: unknown, copy: Copy, where?: { stage?: AssistantVoiceStage; computer: string }): string {
  // Listening, transcription and speech change nothing on the computer: a dropped voice line there needs the
  // link or the computer checked, not a command's result. Only the sent message can be unknown. The heading
  // already names the step, so the line does not repeat it, and it does not guess Wi-Fi over the computer.
  const dropped = error instanceof HostWsError ? error.uncertain || error.category === "network"
    : error instanceof RemoteHostError && (error.uncertain || error.kind === "network");
  if (where?.stage && where.stage !== "reply" && dropped)
    return copy("Bağlantı koptu. {p0} açık ve telefonla aynı ağda mı kontrol edip yeniden dene.",
      "The connection dropped. Check that {p0} is on and on the same network as this phone, then try again.", { p0: where.computer });
  if (!(error instanceof AssistantCallError)) return voiceDetailMessage(error, copy);
  // The transport's own "check this command's result" would repeat the reason's check sentence.
  if (error.reason === "result-unknown") return unknownResultMessage(error.detail, copy);
  const reason = reasonMessage(error.reason, copy);
  return error.detail === undefined ? reason : `${reason}\n${voiceDetailMessage(error.detail, copy)}`;
}
