import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildDiagnosticReport } from "./diagnostic-report";
import {
  diagnosticPending,
  diagnosticReceipt,
  diagnosticSharingGeneration,
  dismissDiagnosticReceipt,
  mountDiagnosticSharing,
  reviewDiagnosticSharing,
  setDiagnosticReceiptsShown,
} from "./diagnostic-sharing";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => undefined },
}));
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
}));

const report = buildDiagnosticReport({
  trigger: "manual",
  log: "error email=person@example.com",
  note: "contact person@example.com",
  email: "person@example.com",
  crash: null,
  context: { appVersion: "1.0.0", platform: "android", osVersion: "16", channel: "stable" },
  now: new Date("2026-11-24T09:00:00Z"),
})!;
const destination = "https://account.test/v1/diagnostics/reports";
let unmount: () => void;

beforeEach(async () => {
  await setDiagnosticReceiptsShown(true);
  unmount = mountDiagnosticSharing();
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

it("shows the redacted upload before asking and reuses its contents in the receipt", async () => {
  const send = vi.fn(async () => "sent" as const);
  const sendResult = reviewDiagnosticSharing(report, destination, true, diagnosticSharingGeneration(), () => "ask", send);
  const pending = diagnosticPending();
  expect(pending?.destination).toBe(destination);
  expect(pending?.log).toContain("error");
  expect(pending?.log).not.toContain("person@example.com");
  expect(pending?.metadata).not.toContain("person@example.com");
  expect(send).not.toHaveBeenCalled();
  pending?.decide(true);
  expect(await sendResult).toBe("sent");
  expect(diagnosticReceipt()).toMatchObject({ destination, log: pending?.log, metadata: pending?.metadata });
  dismissDiagnosticReceipt();
  expect(diagnosticReceipt()).toBeNull();
});

it("pauses automatic diagnostic sharing while reviewing and respects hidden receipts", async () => {
  vi.useFakeTimers();
  await setDiagnosticReceiptsShown(false);
  const send = vi.fn(async () => "sent" as const);
  const sendResult = reviewDiagnosticSharing(report, destination, true, diagnosticSharingGeneration(), () => "auto", send);
  diagnosticPending()?.inspect(true);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(send).not.toHaveBeenCalled();
  diagnosticPending()?.inspect(false);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await sendResult).toBe("sent");
  expect(diagnosticReceipt()).toBeNull();
});

it("cannot send a queued report after the account or app scope changes", async () => {
  const send = vi.fn(async () => "sent" as const);
  const preparedFor = diagnosticSharingGeneration();
  const sendResult = reviewDiagnosticSharing(report, destination, true, preparedFor, () => "ask", send);
  unmount();
  unmount = mountDiagnosticSharing();
  expect(await sendResult).toBe("failed");
  expect(await reviewDiagnosticSharing(report, destination, true, preparedFor, () => "ask", send)).toBe("failed");
  expect(send).not.toHaveBeenCalled();
});
