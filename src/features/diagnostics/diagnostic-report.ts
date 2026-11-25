import {
  AccountApiError,
  composeDiagnosticLog,
  DIAGNOSTIC_GZIP_MAX_BASE64,
  redactDiagnosticText,
  type DiagnosticReportCreate,
  type DiagnosticSection,
  type DiagnosticTrigger,
  type FeedbackContext,
} from "../account/contracts";
import { gzipBase64 } from "./diagnostic-gzip";
import { capSections } from "./host-logs";
import type { CrashMarker } from "./diagnostic-capture";

export type DiagnosticSendResult = "sent" | "rate-limited" | "not-configured" | "failed" | "empty" | "declined";

export interface BuildReportInput {
  trigger: DiagnosticTrigger;
  log: string;
  crash: CrashMarker | null;
  /** `mobile-environment` text; never contains an email. */
  environment?: string;
  /** Already renamed `remote-host*` sections from connected Hosts. */
  hostSections?: DiagnosticSection[];
  email: string | null;
  /** What the user typed about the problem; redacted like the log. */
  note?: string;
  feedbackId?: string;
  context: FeedbackContext;
  now: Date;
}

const clip = (value: string, max: number) => value.slice(0, max);

/** Redacted, gzipped report body, or `null` when there is nothing to send. Throws when it cannot fit the upload limit. */
export function buildDiagnosticReport(input: BuildReportInput): DiagnosticReportCreate | null {
  const values = input.email ? [input.email] : [];
  const sections: DiagnosticSection[] = [];
  if (input.environment) sections.push({ name: "mobile-environment", text: input.environment });
  sections.push({ name: "mobile", text: input.log });
  if (input.crash)
    sections.push({
      name: "mobile-crash",
      text: [input.crash.message, input.crash.stack].filter(Boolean).join("\n"),
    });
  const all = capSections(sections, input.hostSections ?? []);
  let composed = composeDiagnosticLog(all, { values });
  if (composed.sources.length === 0) return null;
  let data = gzipBase64(composed.text);
  if (data.length > DIAGNOSTIC_GZIP_MAX_BASE64) {
    // Poorly compressible logs: keep only the newest half once, else give up on this report.
    composed = composeDiagnosticLog(all, { values, maxChars: Math.floor(composed.text.length / 2) });
    if (composed.sources.length === 0) return null;
    data = gzipBase64(composed.text);
    if (data.length > DIAGNOSTIC_GZIP_MAX_BASE64) throw new Error("The diagnostic log is too large to upload.");
  }
  const note = input.note ? redactDiagnosticText(input.note, { values }).trim() : "";
  const summary = input.crash
    ? redactDiagnosticText(input.crash.message, { values }).replace(/\s+/g, " ").trim()
    : "";
  return {
    trigger: input.trigger,
    occurredAt: (input.crash ? new Date(input.crash.occurredAt) : input.now).toISOString(),
    context: {
      ...input.context,
      appVersion: clip(input.context.appVersion, 32),
      osVersion: clip(input.context.osVersion, 64),
    },
    ...(summary ? { summary: clip(summary, 500) } : {}),
    ...(note ? { note: clip(note, 2000) } : {}),
    ...(input.feedbackId ? { feedbackId: input.feedbackId } : {}),
    sources: composed.sources,
    content: { encoding: "gzip-base64", data },
  };
}

export interface DiagnosticTransport {
  /** Signed-in route; `null` when signed out. */
  signedIn: ((body: DiagnosticReportCreate) => Promise<unknown>) | null;
  /** Anonymous route; `null` when no account service is configured in this build. */
  anonymous: ((body: DiagnosticReportCreate) => Promise<unknown>) | null;
  timeoutMs?: number;
}

const DEADLINE_MS = 20_000;

export async function sendDiagnosticReport(
  report: DiagnosticReportCreate | null,
  transport: DiagnosticTransport,
): Promise<DiagnosticSendResult> {
  if (!report) return "empty";
  const send = transport.signedIn ?? transport.anonymous;
  if (!send) return "not-configured";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    // shortcut: the deadline abandons the request instead of aborting it; upgrade when the client accepts an AbortSignal.
    timer = setTimeout(() => reject(new Error("Diagnostic upload timed out.")), transport.timeoutMs ?? DEADLINE_MS);
  });
  try {
    await Promise.race([send(report), deadline]);
    return "sent";
  } catch (error) {
    return error instanceof AccountApiError && error.status === 429 ? "rate-limited" : "failed";
  } finally {
    clearTimeout(timer);
  }
}
