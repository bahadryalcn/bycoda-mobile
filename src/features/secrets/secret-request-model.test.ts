import { describe, expect, it, vi } from "vitest";
import {
  answerSecretRequest,
  SecretInputListResultSchema,
  type SecretRequest,
} from "./secret-request-model";
import { readonlyRequest } from "../../remote/request-policy";
import {
  MAX_SECRET_BYTES,
  secretAnswer,
  secretAnswerable,
  secretExpired,
} from "./secret-request-model";

describe("secret request model", () => {
  const request: SecretRequest = {
    id: "r",
    signature: "a".repeat(64),
    sessionId: "s",
    title: "Secret",
    message: "Deploy",
    fieldLabel: "API key",
    confirmLabel: "Save",
    cancelLabel: "Cancel",
    deadline: 100,
  };
  it("sends identity and exact answer directly, with retries disabled", async () => {
    const port = { request: vi.fn(async () => ({ accepted: true })) };
    await answerSecretRequest(port, request, { value: " value " }, 1);
    expect(port.request).toHaveBeenCalledWith(
      "secrets.input.answer",
      { id: "r", signature: request.signature, value: " value " },
      { retry: false },
    );
    await answerSecretRequest(port, request, { cancelled: true }, 1);
    expect(port.request).toHaveBeenLastCalledWith(
      "secrets.input.answer",
      { id: "r", signature: request.signature, cancelled: true },
      { retry: false },
    );
    expect(readonlyRequest("secrets.input.answer", {})).toBe(false);
  });
  it("refuses expired, oversized and unacknowledged answers", async () => {
    const port = { request: vi.fn(async () => ({})) };
    await expect(answerSecretRequest(port, request, { value: "x" }, 100)).rejects.toThrow();
    await expect(
      answerSecretRequest(port, request, { value: "é".repeat(4097) }, 1),
    ).rejects.toThrow();
    expect(port.request).not.toHaveBeenCalled();
    await expect(answerSecretRequest(port, request, { value: "x" }, 1)).rejects.toThrow();
  });
  it("accepts metadata only and rejects values in list entries", () => {
    const entry = { ...request, kind: "secret", remote: true };
    expect(SecretInputListResultSchema.safeParse({ requests: [entry] }).success).toBe(true);
    expect(
      SecretInputListResultSchema.safeParse({ requests: [{ ...entry, value: "never" }] }).success,
    ).toBe(false);
  });
  it("answers with the exact value, whitespace included", () => {
    expect(secretAnswer(" a b ")).toEqual({ value: " a b " });
  });

  it("cancels with the cancelled shape", () => {
    expect(secretAnswer(null)).toEqual({ cancelled: true });
  });

  it("refuses empty and oversize values by UTF-8 bytes", () => {
    expect(secretAnswerable("")).toBe(false);
    expect(secretAnswerable("a".repeat(MAX_SECRET_BYTES))).toBe(true);
    expect(secretAnswerable("a".repeat(MAX_SECRET_BYTES + 1))).toBe(false);
    expect(secretAnswerable("é".repeat(MAX_SECRET_BYTES / 2 + 1))).toBe(false);
    expect(secretAnswer("")).toBeNull();
  });

  it("detects an elapsed deadline", () => {
    expect(secretExpired({ deadline: 10 }, 10)).toBe(true);
    expect(secretExpired({ deadline: 11 }, 10)).toBe(false);
  });
});
