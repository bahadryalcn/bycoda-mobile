import { AccountApiError, type Computer, type PairRequestStatus } from "../account/contracts";
import {
  generatePairKeypair,
  openPairTicket,
  pairSasCode,
} from "../../../../src/integrations/account-pair-crypto";
import { nativeRandomBytes } from "@/remote/native-random";
import { MobilePairingCodeError } from "../../../../src/integrations/mobile-pairing";
import { parseDesktopPairingCode } from "./pairing-code";
import type { MobilePairingCode } from "./pairing-code";
import type { MobileMachine } from "@/remote/types";
import type { PairingCopy } from "./connection-types";

export const ACCOUNT_PAIR_POLL_MS = 1_000;
export const ACCOUNT_PAIR_TIMEOUT_MS = 120_000;
const MAX_POLL_FAILURES = 5;
const MAX_POLL_INTERVAL_MS = 5_000;

export type AccountPairingFailureKind =
  | "denied"
  | "expired"
  | "cancelled"
  | "unavailable"
  | "gone"
  | "rate-limit"
  | "invalid"
  | "network"
  | "key-changed";

export class AccountPairingError extends Error {
  constructor(readonly kind: AccountPairingFailureKind) {
    super(kind);
    this.name = "AccountPairingError";
  }
}

/** The binding both ends feed into AES-GCM; any mismatch makes the box unreadable. */
export function accountPairAad(
  requestId: string,
  phoneDeviceId: string,
  computer: Pick<Computer, "deviceId" | "environmentId">,
): string {
  return `bycoda-pair|${requestId}|${phoneDeviceId}|${computer.deviceId}|${computer.environmentId}`;
}

export type AccountPairingClient = {
  createPairRequest(input: {
    params: { deviceId: string };
    body: { phonePublicKey: string };
  }): Promise<{ id: string; expiresAt: string }>;
  getPairRequest(input: { params: { id: string } }): Promise<PairRequestStatus>;
};

export type AccountPairingDependencies = {
  client: AccountPairingClient;
  phoneDeviceId: string;
  computer: Computer;
  signal: AbortSignal;
  /** Receives the six digits the owner compares with the computer. */
  onCode: (sas: string) => void;
  randomBytes?: (size: number) => Promise<Uint8Array>;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  pollMs?: number;
  timeoutMs?: number;
};

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * `step` matters for 404: when filing the request it means the API or computer is not there, but
 * mid-poll the request itself was deleted (cancelled, expired, or the account signed out).
 */
function requestFailure(error: unknown, step: "create" | "poll" = "create"): AccountPairingError {
  if (error instanceof AccountApiError) {
    if (error.status === 404 && step === "poll") return new AccountPairingError("gone");
    if (error.status === 404 || error.status === 405 || error.status === 501)
      return new AccountPairingError("unavailable");
    if (error.status === 429) return new AccountPairingError("rate-limit");
  }
  return new AccountPairingError("network");
}

/**
 * Files a pair request, waits for the computer owner to approve, and returns the pairing code
 * the desktop sealed to this phone. It only brokers the code; redeeming and connecting stay in
 * the existing pairing path.
 */
export async function requestAccountPairingCode(
  deps: AccountPairingDependencies,
): Promise<MobilePairingCode> {
  const { client, computer, signal } = deps;
  const now = deps.now ?? Date.now;
  const elapsedClock = deps.now ?? (() => performance.now());
  const sleep = deps.sleep ?? abortableSleep;
  const keypair = await generatePairKeypair(deps.randomBytes ?? nativeRandomBytes);
  try {
    if (signal.aborted) throw new AccountPairingError("cancelled");
    let created: { id: string; expiresAt: string };
    const localDeadline = elapsedClock() + (deps.timeoutMs ?? ACCOUNT_PAIR_TIMEOUT_MS);
    try {
      created = await client.createPairRequest({
        params: { deviceId: computer.deviceId },
        body: { phonePublicKey: keypair.publicKey },
      });
    } catch (error) {
      throw signal.aborted ? new AccountPairingError("cancelled") : requestFailure(error);
    }
    deps.onCode(pairSasCode(created.id, keypair.publicKey));
    const serviceRemaining = Date.parse(created.expiresAt) - now();
    // A phone clock ahead of the service can see an already-expired date on a new request.
    // Keep polling under the local cap in that case so the service can report the actual state.
    const deadline = serviceRemaining > 0
      ? Math.min(localDeadline, elapsedClock() + serviceRemaining)
      : localDeadline;
    let failures = 0;
    let polls = 0;
    while (true) {
      if (signal.aborted) throw new AccountPairingError("cancelled");
      if (elapsedClock() >= deadline) throw new AccountPairingError("expired");
      let status: PairRequestStatus | null = null;
      try {
        status = await client.getPairRequest({ params: { id: created.id } });
        failures = 0;
      } catch (error) {
        if (signal.aborted) throw new AccountPairingError("cancelled");
        const failure = requestFailure(error, "poll");
        if (failure.kind === "unavailable" || failure.kind === "gone" || ++failures >= MAX_POLL_FAILURES) throw failure;
      }
      if (signal.aborted) throw new AccountPairingError("cancelled");
      if (status) {
        if (status.state === "denied") throw new AccountPairingError("denied");
        if (status.state === "expired" || status.state === "delivered")
          throw new AccountPairingError("expired");
        if (status.state === "sealed") {
          if (!status.sealed || !status.desktopPublicKey) throw new AccountPairingError("invalid");
          return openCode(status, keypair.privateKey, deps, created.id);
        }
      }
      const interval = deps.pollMs ?? Math.min(
        MAX_POLL_INTERVAL_MS,
        ACCOUNT_PAIR_POLL_MS * 2 ** Math.min(3, Math.max(0, polls - 2)),
      );
      polls++;
      await sleep(Math.min(interval, Math.max(0, deadline - elapsedClock())), signal);
    }
  } finally {
    keypair.privateKey.fill(0);
  }
}

function openCode(
  status: PairRequestStatus,
  privateKey: Uint8Array,
  deps: AccountPairingDependencies,
  requestId: string,
): MobilePairingCode {
  try {
    const plain = openPairTicket(
      { desktopPublicKey: status.desktopPublicKey!, sealed: status.sealed! },
      privateKey,
      accountPairAad(requestId, deps.phoneDeviceId, deps.computer),
    );
    const code = parseDesktopPairingCode(plain);
    if (code.environmentId !== deps.computer.environmentId) throw new AccountPairingError("invalid");
    return code;
  } catch (error) {
    if (error instanceof AccountPairingError) throw error;
    if (error instanceof MobilePairingCodeError && error.kind === "expired")
      throw new AccountPairingError("expired");
    throw new AccountPairingError("invalid");
  }
}

/**
 * A saved computer with the same identity keeps its pinned LAN key: a code with a different key
 * must be reviewed by removing the saved connection first, never replaced silently. A code with
 * no key (an HTTPS route such as Tailscale) for the same environment is an extra route, not a
 * key change; the saved pin stays with the LAN route.
 */
export function assertPinUnchanged(code: MobilePairingCode, machines: MobileMachine[]): void {
  const saved = machines.find((machine) => machine.environmentId === code.environmentId);
  if (saved?.lanKey && code.lanKey && saved.lanKey !== code.lanKey)
    throw new AccountPairingError("key-changed");
}

/**
 * The directory is account-supplied, so a computer this phone has never paired with needs the
 * owner's explicit "connect to new computer" confirmation before the ticket is redeemed.
 */
export function needsNewComputerConfirmation(
  code: Pick<MobilePairingCode, "environmentId">,
  machines: MobileMachine[],
): boolean {
  return !machines.some((machine) => machine.environmentId === code.environmentId);
}

export function accountPairingMessage(error: unknown, copy: PairingCopy): string {
  const kind = error instanceof AccountPairingError ? error.kind : undefined;
  switch (kind) {
    case "denied":
      return copy("Bilgisayarda istek reddedildi.", "The request was denied on the computer.");
    case "expired":
      return copy(
        "İstek onaylanmadan zaman aşımına uğradı. Yeniden dene.",
        "The request expired before it was approved. Try again.",
      );
    case "gone":
      return copy(
        "Bu istek artık yok (iptal edildi veya süresi doldu). Yeniden dene.",
        "This request no longer exists (it was cancelled or expired). Try again.",
      );
    case "cancelled":
      return copy("Bağlantı iptal edildi.", "Connection cancelled.");
    case "unavailable":
      return copy(
        "Hesapla bağlanma şu anda kullanılamıyor. QR kodu kullan veya elle bağlan.",
        "Connecting through your account is not available right now. Use a QR code or connect manually.",
      );
    case "rate-limit":
      return copy(
        "Çok fazla istek gönderildi. Biraz bekleyip yeniden dene.",
        "Too many requests. Wait briefly and try again.",
      );
    case "key-changed":
      return copy(
        "Bu bilgisayarın güvenlik anahtarı değişmiş. Kayıtlı bağlantıyı kaldırıp yeniden bağlan.",
        "This computer's security key changed. Remove the saved connection, then connect again.",
      );
    case "invalid":
      return copy(
        "Bilgisayardan gelen yanıt doğrulanamadı. Yeniden dene.",
        "The computer's reply could not be verified. Try again.",
      );
    default:
      return copy(
        "Hesabına ulaşılamadı. Bağlantını kontrol edip yeniden dene.",
        "Your account could not be reached. Check the connection and try again.",
      );
  }
}
