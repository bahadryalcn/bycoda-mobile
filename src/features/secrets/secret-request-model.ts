/** Same bound the Host and desktop enforce on one secret (UTF-8 bytes). */
export const MAX_SECRET_BYTES = 8192;

/** A masked request as the Host describes it. Only the labels and deadline are ever held; never the typed value. */
export type SecretRequest = {
  id: string;
  signature: string;
  sessionId: string;
  title: string;
  message: string;
  fieldLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  deadline: number;
};

export { SecretInputListResultSchema } from "../../../../src/shared/model/host-contracts/secrets-input";
export const SECRET_INPUT_CAPABILITY = "secrets.remoteAnswer.v1";

/** Answers bypass mutations/outbox and never permit transport retries. */
export async function answerSecretRequest(
  port: {
    request(
      method: string,
      params: Record<string, unknown>,
      options: { retry: false },
    ): Promise<unknown>;
  },
  request: SecretRequest,
  answer: SecretAnswer,
  now = Date.now(),
): Promise<void> {
  if (secretExpired(request, now) || ("value" in answer && !secretAnswerable(answer.value)))
    throw new Error("Secret request is unavailable.");
  const result = await port.request(
    "secrets.input.answer",
    { id: request.id, signature: request.signature, ...answer },
    { retry: false },
  );
  if (!result || typeof result !== "object" || !("accepted" in result) || result.accepted !== true)
    throw new Error("Secret answer could not be confirmed.");
}

/** Bounded fallback for the pending list; session updates normally refresh it sooner. */
export const SECRET_POLL_MS = 15_000;
export const SECRET_POLL_MAX_MS = 60_000;
/** Minimum spacing between list reads that session updates trigger. */
export const SECRET_SIGNAL_MIN_MS = 1_500;
/** Longest single timer; the expiry check re-arms itself after each one. */
const SECRET_TIMER_MAX_MS = 60_000;

/** Fallback poll delay, backing off with consecutive failures up to the cap. */
export const secretPollDelay = (failures: number) =>
  Math.min(SECRET_POLL_MAX_MS, SECRET_POLL_MS * 2 ** Math.min(Math.max(failures, 0), 4));

/** Failures that polling cannot fix; the list resumes when access, identity or capability is restored. */
const SECRET_POLL_STOP_KINDS: readonly string[] = ["auth", "identity", "unsupported"];

/** Fallback interval for the pending list, or false after a failure a retry cannot cure. */
export const secretPollInterval = (failures: number, errorKind: string | undefined) =>
  errorKind && SECRET_POLL_STOP_KINDS.includes(errorKind) ? false : secretPollDelay(failures);

/** How long to wait before a session-triggered read may run (0 = now). */
export const secretSignalDelay = (lastAt: number, now: number) =>
  Math.max(0, lastAt + SECRET_SIGNAL_MIN_MS - now);

/** Time until the earliest deadline among the requests, or null when none is pending. */
export function nextSecretExpiryDelay(
  requests: readonly Pick<SecretRequest, "deadline">[],
  now: number,
): number | null {
  let next: number | null = null;
  for (const request of requests)
    if (!secretExpired(request, now) && (next === null || request.deadline < next))
      next = request.deadline;
  return next === null ? null : Math.min(SECRET_TIMER_MAX_MS, Math.max(0, next - now));
}

/** `{ value }` or `{ cancelled: true }`: exactly the answer shape `secrets.input.authorize` accepts. */
export type SecretAnswer = { value: string } | { cancelled: true };

export const secretByteLength = (value: string) => new TextEncoder().encode(value).length;

export const secretAnswerable = (value: string) => {
  const size = value.length === 0 ? 0 : secretByteLength(value);
  return size > 0 && size <= MAX_SECRET_BYTES;
};

export const secretExpired = (request: Pick<SecretRequest, "deadline">, now: number) =>
  request.deadline <= now;

/** Builds the answer without trimming: whitespace can be part of a secret. */
export function secretAnswer(value: string | null): SecretAnswer | null {
  if (value === null) return { cancelled: true };
  return secretAnswerable(value) ? { value } : null;
}
