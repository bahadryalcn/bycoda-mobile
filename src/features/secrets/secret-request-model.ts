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
