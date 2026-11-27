import type { BusySendMode } from "@/state/busy-send";
import type { ComposerDelivery } from "./composer-delivery";

/**
 * The composer's single trailing action. Idle: Send. A run with an empty draft: one Stop. A run
 * with a draft: the delivery button showing the default mode (steer or queue); Stop then waits for
 * an empty draft (or the session actions), so the capsule never shows two filled squares.
 */
export type ComposerTrailingAction =
  | { kind: "stop" }
  | { kind: "deliver"; mode: ComposerDelivery; alternate: BusySendMode | null };

export function composerTrailingAction(input: {
  /** A run is active and its id is known, so Stop can target it. */
  canStop: boolean;
  hasContent: boolean;
  mode: ComposerDelivery;
  /** The other busy mode, only when it can really be delivered. */
  alternate: BusySendMode | null;
}): ComposerTrailingAction {
  if (input.canStop && !input.hasContent) return { kind: "stop" };
  return { kind: "deliver", mode: input.mode, alternate: input.mode === "send" ? null : input.alternate };
}

/**
 * Longest the Stop spinner waits for the Host's reply. The transport bounds the request itself
 * (and its status check) well inside this; the bound here only guarantees the spinner ends.
 */
export const STOP_REPLY_MS = 30_000;

/**
 * Longest "Stopping" waits for the snapshot to show the run ending after the Host accepted Stop.
 * The Host answers at once but keeps the session running while it retires the provider process
 * and captures the turn's files; that measured 14 to 18 seconds on a large checkout.
 */
export const STOP_SETTLE_MS = 30_000;

/** Longest the last re-read of the snapshot may take before a passed bound is reported anyway. */
export const STOP_RECHECK_MS = 3_000;

/** One Stop for a run: sent, and accepted once the Host replied. `attempt` tells a retry from a late reply. */
export type StopRequest = { runId: string; attempt: number; sentAt: number; acceptedAt?: number };

/**
 * `sending`: waiting for the Host's reply. `settling`: accepted, the run is winding down.
 * `unconfirmed`: a bound passed with the run still running, so Stop is offered again.
 */
export type StopPhase = "idle" | "sending" | "settling" | "unconfirmed";

type StopSession = { status?: string; runId?: string } | undefined;

/**
 * Where a Stop stands. It never fabricates a stopped state: only the snapshot ends a request
 * (`idle`), and both waits are bounded so the spinner cannot outlive a reply that never comes.
 */
export function stopPhase(request: StopRequest | null, session: StopSession, now: number): StopPhase {
  if (!request) return "idle";
  if (session?.status !== "running" || session.runId !== request.runId) return "idle";
  if (request.acceptedAt === undefined) return now - request.sentAt < STOP_REPLY_MS ? "sending" : "unconfirmed";
  return now - request.acceptedAt < STOP_SETTLE_MS ? "settling" : "unconfirmed";
}

/** Whether Stop shows its spinner and ignores taps. Outside a wait it can always be pressed. */
export function stopStillPending(request: StopRequest | null, session: StopSession, now: number): boolean {
  const phase = stopPhase(request, session, now);
  return phase === "sending" || phase === "settling";
}

/** When the current wait ends and the owner must look again. */
export function stopDeadline(request: StopRequest | null): number | undefined {
  if (!request) return undefined;
  return request.acceptedAt === undefined ? request.sentAt + STOP_REPLY_MS : request.acceptedAt + STOP_SETTLE_MS;
}

export function sentStop(runId: string, attempt: number, now: number): StopRequest {
  return { runId, attempt, sentAt: now };
}

/** The Host accepted this attempt. A reply for a replaced attempt changes nothing. */
export function acceptedStop(request: StopRequest | null, attempt: number, now: number): StopRequest | null {
  return request?.attempt === attempt ? { ...request, acceptedAt: now } : request;
}

/** This attempt failed: Stop is offered again. A failure of a replaced attempt changes nothing. */
export function failedStop(request: StopRequest | null, attempt: number): StopRequest | null {
  return request?.attempt === attempt ? null : request;
}

/** Why Stop is offered again while the run is still going. */
export function stopUnconfirmedMessage(request: StopRequest, copy: (tr: string, en: string) => string): string {
  return request.acceptedAt === undefined
    ? copy("Bilgisayardan henüz yanıt gelmedi. Yeniden denemek için Durdur'a dokun.", "No reply from the computer yet. Tap Stop to try again.")
    : copy("Bilgisayar Durdur'u kabul etti ama tur hâlâ çalışıyor. Yeniden denemek için Durdur'a dokun.", "The computer accepted Stop, but the turn is still running. Tap Stop to try again.");
}
