import { gunzipSync, strFromU8 } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { AccountApiError, DiagnosticReportCreate } from "../account/contracts";
import { installDiagnosticCapture, readCrashMarker } from "./diagnostic-capture";
import { CRASH_MARKER, CURRENT_LOG, PREVIOUS_LOG, type DiagnosticFiles } from "./diagnostic-files";
import { createDiagnosticPrefs, periodicDue } from "./diagnostic-prefs";
import { buildDiagnosticReport, sendDiagnosticReport } from "./diagnostic-report";
import { decideStartup, shouldSendPeriodic } from "./diagnostic-startup";
import { EMPTY_FEEDBACK_DRAFT, submitFeedback, validateFeedbackDraft } from "./feedback-model";
import { useFeedbackDraft } from "./feedback-store";
import { createLogBuffer } from "./log-buffer";
import { logDiagnostic } from "./diagnostic-log";
import { capSections, collectHostLogs, parseHostLogs } from "./host-logs";
import { collectEnvironment, ENVIRONMENT_SECTION } from "./diagnostic-environment";
import { templateRoute, transportKind } from "./diagnostic-events";
import { DIAGNOSTIC_GZIP_MAX_BASE64, DiagnosticSourceName, parseDiagnosticLine } from "../account/contracts";

function memoryFiles(initial: Record<string, string> = {}): DiagnosticFiles & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    read: (name) => map.get(name) ?? null,
    write: (name, text) => void map.set(name, text),
    remove: (name) => void map.delete(name),
  };
}

const gunzip = (report: { content: { data: string } }) =>
  strFromU8(gunzipSync(Uint8Array.from(atob(report.content.data), (c) => c.charCodeAt(0))));

const context = { appVersion: "1.2.3", platform: "android" as const, osVersion: "Android 15", channel: "stable" as const };

describe("log buffer", () => {
  it("keeps at most the newest lines and characters", () => {
    const lines = createLogBuffer(3, 1000);
    for (const n of [1, 2, 3, 4]) lines.push(`line ${n}`);
    expect(lines.text()).toBe("line 2\nline 3\nline 4");
    const chars = createLogBuffer(100, 30);
    chars.push("a".repeat(20));
    chars.push("b".repeat(20));
    expect(chars.text()).toBe("b".repeat(20));
  });
});

describe("capture", () => {
  const setup = (files = memoryFiles()) => {
    const warn = vi.fn();
    const consoleLike = { warn, error: vi.fn() };
    let handler: (error: unknown, fatal?: boolean) => void = () => undefined;
    const previous = vi.fn();
    handler = previous;
    const errorUtils = { getGlobalHandler: () => handler, setGlobalHandler: (next: typeof handler) => void (handler = next) };
    const timers: (() => void)[] = [];
    const capture = installDiagnosticCapture({
      files,
      console: consoleLike,
      errorUtils,
      appVersion: "1.2.3",
      now: () => new Date("2026-11-09T10:00:00Z"),
      setTimer: (run) => timers.push(run),
      clearTimer: () => undefined,
    });
    return { files, capture, consoleLike, warn, previous, fire: (e: unknown, fatal: boolean) => handler(e, fatal), timers };
  };

  it("records warnings, keeps the original and persists on flush", () => {
    const { capture, consoleLike, warn, files } = setup();
    consoleLike.warn("careful", 42);
    expect(warn).toHaveBeenCalledWith("careful", 42);
    capture.flush();
    expect(files.map.get(CURRENT_LOG)).toContain("2026-11-09T10:00:00.000Z WARN  [mobile.console] careful 42");
  });

  it("collapses identical consecutive events and records categories", () => {
    const { capture, files, consoleLike } = setup();
    logDiagnostic("info", "mobile.nav", "route", { path: "/session/:id" });
    for (let i = 0; i < 3; i++) consoleLike.error("same");
    logDiagnostic("warn", "mobile.rpc", "host request failed", { method: "x.y", error: "network", ms: 12 });
    capture.flush();
    const text = files.map.get(CURRENT_LOG)!;
    expect(text.match(/\[mobile\.console\] same/g)).toHaveLength(1);
    expect(text).toContain("previous event repeated 2 times");
    expect(text).toContain("[mobile.nav] route path=/session/:id");
    expect(text).toContain("[mobile.rpc] host request failed method=x.y error=network ms=12");
    expect(text).toContain("[mobile.app] cold start");
    for (const line of text.split("\n")) expect(parseDiagnosticLine(line)).not.toBeNull();
  });

  it("rotates the previous run's log", () => {
    const { capture, files } = setup(memoryFiles({ [CURRENT_LOG]: "old line" }));
    expect(files.map.get(PREVIOUS_LOG)).toBe("old line");
    expect(capture.readLog().startsWith("old line\n--- app restarted ---")).toBe(true);
  });

  it("writes a crash marker on fatal errors and chains the previous handler", () => {
    const { fire, previous, files } = setup();
    const error = new Error("boom");
    fire(error, true);
    expect(readCrashMarker(files)).toMatchObject({ message: "boom", appVersion: "1.2.3" });
    expect(files.map.get(CURRENT_LOG)).toContain("FATAL");
    expect(previous).toHaveBeenCalledWith(error, true);
  });

  it("does not write a marker for non-fatal errors", () => {
    const { fire, previous, files } = setup();
    fire(new Error("soft"), false);
    expect(files.map.has(CRASH_MARKER)).toBe(false);
    expect(previous).toHaveBeenCalled();
  });
});

describe("consent and startup", () => {
  const marker = JSON.stringify({ message: "boom", stack: "s", occurredAt: "2026-11-09T09:00:00.000Z", appVersion: "1" });

  it("treats an unset or broken choice as ask", async () => {
    const store = new Map<string, string>();
    const prefs = createDiagnosticPrefs({ getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => void store.set(k, v) });
    expect((await prefs.readConsent()).mode).toBeNull();
    store.set("bycoda.mobile.diagnostics-consent.v1", "{oops");
    expect((await prefs.readConsent()).mode).toBeNull();
    await prefs.writeConsent("auto");
    expect((await prefs.readConsent()).mode).toBe("auto");
  });

  it.each([
    ["auto", "send-crash"],
    ["ask", "prompt"],
    [null, "prompt"],
  ] as const)("mode %s with a marker gives %s", (mode, kind) => {
    expect(decideStartup(memoryFiles({ [CRASH_MARKER]: marker }), mode).kind).toBe(kind);
  });

  it("off discards the marker", () => {
    const files = memoryFiles({ [CRASH_MARKER]: marker });
    expect(decideStartup(files, "off").kind).toBe("none");
    expect(files.map.has(CRASH_MARKER)).toBe(false);
  });

  it("sends periodically only in auto mode after seven days", () => {
    const now = new Date("2026-11-09T00:00:00Z");
    expect(periodicDue(new Date("2026-11-03T00:00:00Z"), now, 7)).toBe(false);
    expect(shouldSendPeriodic("auto", new Date("2026-11-02T00:00:00Z"), now)).toBe(true);
    expect(shouldSendPeriodic("auto", null, now)).toBe(true);
    expect(shouldSendPeriodic("ask", null, now)).toBe(false);
  });
});

describe("report", () => {
  const crash = { message: "failed for me@example.com", stack: "at x", occurredAt: "2026-11-09T09:00:00.000Z", appVersion: "1" };

  it("builds a valid redacted report with crash section and summary", () => {
    const report = buildDiagnosticReport({
      trigger: "crash",
      log: "2026 WARN token=abcdef123456 user me@example.com",
      crash,
      email: "me@example.com",
      context,
      now: new Date("2026-11-09T10:00:00Z"),
    });
    expect(report).not.toBeNull();
    expect(DiagnosticReportCreate.safeParse(report).success).toBe(true);
    expect(report!.sources.map((s) => s.name)).toEqual(["mobile", "mobile-crash"]);
    const text = gunzip(report!);
    expect(text).not.toContain("abcdef123456");
    expect(text).not.toContain("me@example.com");
    expect(text).toContain("===== mobile-crash =====");
    expect(report!.summary).toBe("failed for <redacted>");
    expect(report!.content.encoding).toBe("gzip-base64");
  });

  it("returns null and sends nothing when there is no log", async () => {
    const report = buildDiagnosticReport({ trigger: "manual", log: "", crash: null, email: null, context, now: new Date() });
    expect(report).toBeNull();
    expect(await sendDiagnosticReport(report, { signedIn: null, anonymous: null })).toBe("empty");
  });

  const body = buildDiagnosticReport({ trigger: "manual", log: "a line", crash: null, email: null, context, now: new Date() })!;

  it("prefers the signed-in route and falls back to anonymous", async () => {
    const signedIn = vi.fn().mockResolvedValue({});
    const anonymous = vi.fn().mockResolvedValue({});
    expect(await sendDiagnosticReport(body, { signedIn, anonymous })).toBe("sent");
    expect(anonymous).not.toHaveBeenCalled();
    expect(await sendDiagnosticReport(body, { signedIn: null, anonymous })).toBe("sent");
    expect(anonymous).toHaveBeenCalledOnce();
  });

  it("maps outcomes", async () => {
    expect(await sendDiagnosticReport(body, { signedIn: null, anonymous: null })).toBe("not-configured");
    const limited = async () => {
      throw new AccountApiError(429, "rate_limited", "slow down");
    };
    expect(await sendDiagnosticReport(body, { signedIn: null, anonymous: limited })).toBe("rate-limited");
    const broken = async () => {
      throw new Error("offline");
    };
    expect(await sendDiagnosticReport(body, { signedIn: null, anonymous: broken })).toBe("failed");
  });

  it("fails when the request outlives the deadline", async () => {
    const hang = () => new Promise<never>(() => undefined);
    expect(await sendDiagnosticReport(body, { signedIn: null, anonymous: hang, timeoutMs: 10 })).toBe("failed");
  });
});

describe("events and environment", () => {
  it("templates dynamic route segments and drops queries", () => {
    expect(templateRoute("/session/abc-123?token=x")).toBe("/session/:id");
    expect(templateRoute("/project/web")).toBe("/project/:id");
    expect(templateRoute("/legal/privacy")).toBe("/legal/privacy");
    expect(templateRoute("/")).toBe("/");
  });

  it("classifies transports", () => {
    expect(transportKind({ endpoint: "http://192.168.1.4:3000", lanKey: "k" })).toBe("lan");
    expect(transportKind({ endpoint: "http://100.100.1.2:3000" })).toBe("tailscale");
    expect(transportKind({ endpoint: "https://pc.tail1.ts.net" })).toBe("tailscale");
    expect(transportKind({ endpoint: "https://relay.example.com" })).toBe("remote");
  });

  it("keeps the environment free of identity and uses valid section names", () => {
    const text = collectEnvironment({ appVersion: "1.0.0", buildNumber: "42", os: "Android", osVersion: 15, hermes: true, signedIn: true, pairedComputers: 2, fontScale: 1.234 });
    expect(text).toContain("signed-in: yes");
    expect(text).toContain("font-scale: 1.23");
    expect(text).not.toMatch(/@/);
    for (const name of [ENVIRONMENT_SECTION, "mobile", "mobile-crash"]) expect(DiagnosticSourceName.safeParse(name).success).toBe(true);
  });

  it("puts the environment section first in the report", () => {
    const report = buildDiagnosticReport({ trigger: "manual", log: "x", crash: null, environment: "os: Android 15", email: null, context, now: new Date() });
    expect(report!.sources.map((source) => source.name)).toEqual(["mobile-environment", "mobile"]);
  });
});

describe("feedback", () => {
  const receipt = { id: "11111111-1111-4111-8111-111111111111", createdAt: "2026-11-09T10:00:00.000Z" };
  const draft = { ...EMPTY_FEEDBACK_DRAFT, kind: "problem" as const, message: "  It broke  ", rating: 4 };
  const apis = () => ({ sendFeedback: vi.fn().mockResolvedValue(receipt), sendAnonymousFeedback: vi.fn().mockResolvedValue(receipt) });

  it("validates the message", async () => {
    expect(validateFeedbackDraft({ ...draft, message: "  " })).toEqual(["message-missing"]);
    expect(validateFeedbackDraft({ ...draft, message: "x".repeat(2001) })).toEqual(["message-long"]);
    expect(await submitFeedback(apis(), { ...draft, message: "" }, true, { context: () => context })).toEqual({ status: "invalid", issues: ["message-missing"] });
  });

  it("uses the account route when signed in and the anonymous route for guests", async () => {
    const api = apis();
    expect(await submitFeedback(api, draft, true, { context: () => context })).toMatchObject({ status: "sent", reference: receipt.id });
    expect(api.sendFeedback).toHaveBeenCalledOnce();
    expect(api.sendAnonymousFeedback).not.toHaveBeenCalled();
    await submitFeedback(api, draft, false, { context: () => context });
    expect(api.sendAnonymousFeedback).toHaveBeenCalledOnce();
    expect(api.sendFeedback.mock.calls[0]![0].body).toEqual({ kind: "problem", message: "It broke", rating: 4 });
  });

  it("adds context only when ticked", async () => {
    const api = apis();
    await submitFeedback(api, { ...draft, includeContext: true }, true, { context: () => context });
    expect(api.sendFeedback.mock.calls[0]![0].body.context).toEqual(context);
  });

  it("attaches logs with the feedback id and the message as note", async () => {
    const sendLogs = vi.fn().mockResolvedValue("sent");
    const result = await submitFeedback(apis(), { ...draft, attachLogs: true }, true, { context: () => context, sendLogs });
    expect(sendLogs).toHaveBeenCalledWith({ feedbackId: receipt.id, note: "It broke" });
    expect(result).toMatchObject({ status: "sent", logs: "sent" });
    const body = buildDiagnosticReport({ trigger: "feedback", log: "a line", crash: null, email: null, context, now: new Date(), feedbackId: receipt.id, note: "It broke" })!;
    expect(DiagnosticReportCreate.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ feedbackId: receipt.id, note: "It broke", trigger: "feedback" });
  });

  it("keeps feedback success when the log upload fails", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("no"));
    expect(await submitFeedback(apis(), { ...draft, attachLogs: true }, true, { context: () => context, sendLogs: failing })).toMatchObject({ status: "sent", logs: "failed" });
    const limited = vi.fn().mockResolvedValue("rate-limited");
    expect(await submitFeedback(apis(), { ...draft, attachLogs: true }, false, { context: () => context, sendLogs: limited })).toMatchObject({ status: "sent", logs: "rate-limited" });
  });

  it("never uploads logs when the feedback was not received", async () => {
    const api = apis();
    api.sendFeedback.mockRejectedValue(new AccountApiError(429, "rate_limited", "slow"));
    const sendLogs = vi.fn();
    expect(await submitFeedback(api, { ...draft, attachLogs: true }, true, { context: () => context, sendLogs })).toEqual({ status: "rate-limited" });
    expect(sendLogs).not.toHaveBeenCalled();
    api.sendFeedback.mockRejectedValue(new Error("offline"));
    expect(await submitFeedback(api, draft, true, { context: () => context })).toEqual({ status: "failed" });
    expect(await submitFeedback(null, draft, true, { context: () => context })).toEqual({ status: "not-configured" });
  });

  it("keeps the draft in the store until sent", () => {
    useFeedbackDraft.getState().patch({ message: "hello", attachLogs: true });
    expect(useFeedbackDraft.getState().draft.message).toBe("hello");
    expect(useFeedbackDraft.getState().attachTouched).toBe(true);
    useFeedbackDraft.getState().clear();
    expect(useFeedbackDraft.getState().draft).toEqual(EMPTY_FEEDBACK_DRAFT);
  });
});

describe("host logs", () => {
  const supported = { capabilities: ["diagnostics.logs.v1"] };
  const answer = (version: string, names: string[]) => ({
    hostVersion: version,
    sections: names.map((name) => ({ name, text: `${name} line`, truncated: false })),
  });

  it("collects in parallel, skips a failing or unsupported host and renames sections", async () => {
    const machines = [{ id: "a", ...supported }, { id: "b", ...supported }, { id: "c" }, { id: "d", ...supported }];
    const read = vi.fn(async (machine: { id: string }) => {
      if (machine.id === "b") throw new Error("offline");
      return answer(machine.id === "a" ? "1.0.0" : "2.0.0", ["host", "host-previous", "host-environment"]);
    });
    const collected = await collectHostLogs(machines, read);
    expect(read).toHaveBeenCalledTimes(2); // "d" is beyond the three-host limit; "c" lacks the capability
    expect(collected.sections.map((s) => s.name)).toEqual(["remote-host", "remote-host-env"]);
    expect(collected.hostVersions).toEqual(["1.0.0"]);
  });

  it("suffixes further hosts and enforces the deadline", async () => {
    const two = await collectHostLogs([{ id: "a", ...supported }, { id: "b", ...supported }], async () => answer("1", ["host", "host-crash", "host-stdout", "host-previous"]));
    expect(two.sections.map((s) => s.name)).toEqual(["remote-host", "remote-host-crash", "remote-host-2", "remote-host-crash-2"]);
    const slow = await collectHostLogs([{ id: "a", ...supported }], () => new Promise(() => undefined), 10);
    expect(slow.sections).toEqual([]);
  });

  it("ignores malformed answers", () => {
    expect(parseHostLogs({ hostVersion: 1 })).toBeNull();
    expect(parseHostLogs({ hostVersion: "1", sections: [{ name: "other", text: "x" }] })!.sections).toEqual([]);
  });

  it("caps at 16 sources keeping mobile and dropping previous/stdout first", () => {
    const mobile = [{ name: "mobile-environment", text: "a" }, { name: "mobile", text: "b" }];
    const host = ["remote-host", "remote-host-previous", "remote-host-stdout", "remote-host-crash", "remote-host-env"].flatMap((base) =>
      ["", "-2", "-3"].map((suffix) => ({ name: base + suffix, text: "t" })),
    );
    const capped = capSections(mobile, host);
    expect(capped).toHaveLength(16);
    expect(capped.slice(0, 2)).toEqual(mobile);
    const names = capped.map((s) => s.name);
    expect(names).toContain("remote-host-crash-3");
    expect(names.filter((n) => /previous|stdout/.test(n)).length).toBeLessThan(6);
    for (const section of capped) expect(DiagnosticSourceName.safeParse(section.name).success).toBe(true);
  });

  it("round-trips the gzip payload and stays within the upload limit for noisy logs", () => {
    const noisy = Array.from({ length: 6000 }, (_, i) => `${i} ${Math.random().toString(36).repeat(8)}`).join("\n");
    const small = buildDiagnosticReport({ trigger: "manual", log: "hello world\nsecond line", crash: null, email: null, context, now: new Date() })!;
    expect(gunzip(small)).toContain("hello world");
    const big = buildDiagnosticReport({ trigger: "manual", log: noisy, crash: null, email: null, context, now: new Date() })!;
    expect(DiagnosticReportCreate.safeParse(big).success).toBe(true);
    expect(big.content.data.length).toBeLessThanOrEqual(DIAGNOSTIC_GZIP_MAX_BASE64);
  });

  it("adds host versions to the environment and host sections to the report", () => {
    expect(collectEnvironment({ os: "Android", osVersion: 15, hermes: true, signedIn: false, pairedComputers: 2, hostVersions: ["1.0.0", "2.0.0"] })).toContain("host-2-version: 2.0.0");
    const report = buildDiagnosticReport({ trigger: "manual", log: "x", crash: null, hostSections: [{ name: "remote-host", text: "h" }], email: null, context, now: new Date() });
    expect(report!.sources.map((s) => s.name)).toEqual(["mobile", "remote-host"]);
  });
});
