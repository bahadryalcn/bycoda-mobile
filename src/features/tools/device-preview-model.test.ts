import { expect, it } from "vitest";
import { readDevicePreview, readPreviewImpact, readPreviewIntent } from "./device-preview-model";
const intent = { requestId: "request", deviceId: "avd:fixture", url: "exp://127.0.0.1:8081", installExpoGo: false };
const job = () => ({ id: "job", requestId: "request", deviceId: "emulator-5554", state: "ready", verification: "launch-only", updatedAt: "2026-10-22T00:00:00Z", stages: [{ name: "preflight", state: "done" }] });
it("accepts credential-free preview intent and rejects unsafe URLs, permission coercion, and unbounded text", () => {
  expect(readPreviewIntent(intent)).toEqual(intent);
  for (const patch of [{ url: "exp://user:pass@127.0.0.1:8081" }, { url: "https://fixture.invalid?token=private" }, { url: "file:///private" }, { installExpoGo: "true" }, { expectedText: "x".repeat(4097) }])
    expect(() => readPreviewIntent({ ...intent, ...patch })).toThrow();
});
it("binds boot serial transitions to the exact request and bounds screenshots only on explicit frame reads", () => {
  expect(readDevicePreview(job(), intent)).toEqual(job());
  expect(() => readDevicePreview({ ...job(), requestId: "other" }, intent)).toThrow();
  const withFrame = { ...job(), frame: { mime: "image/png", base64: "YWJj", capturedAt: "2026-10-22T00:00:00Z" } };
  expect(() => readDevicePreview(withFrame, intent)).toThrow(); expect(readDevicePreview(withFrame, intent, true)).toEqual(withFrame);
  expect(() => readDevicePreview({ ...job(), token: "private" }, intent)).toThrow();
  expect(() => readDevicePreview({ ...job(), stages: Array(17).fill(job().stages[0]) }, intent)).toThrow();
});
it("accepts only consistent bounded impact counts and rejects foreign identity fields", () => {
  expect(readPreviewImpact({ activeCount: 1, owned: [], otherActiveCount: 1 })).toEqual({ activeCount: 1, owned: [], otherActiveCount: 1 });
  for (const value of [{ activeCount: 1, owned: [], otherActiveCount: 0 }, { activeCount: 129, owned: [], otherActiveCount: 129 }, { activeCount: 1, owned: [], otherActiveCount: 1, foreignIds: ["private"] }])
    expect(() => readPreviewImpact(value)).toThrow();
});
