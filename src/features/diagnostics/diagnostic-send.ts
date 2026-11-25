import type { DiagnosticReportCreate, DiagnosticTrigger, FeedbackContext } from "../account/contracts";
import type { CrashMarker } from "./diagnostic-capture";
import {
  buildDiagnosticReport,
  sendDiagnosticReport,
  type DiagnosticSendResult,
  type DiagnosticTransport,
} from "./diagnostic-report";
import type { CollectedHostLogs } from "./host-logs";

/** The signed-in email only widens redaction (addresses are also masked by pattern), so it gets a short deadline. */
export const SIGNED_IN_EMAIL_DEADLINE_MS = 5000;

/** Result of `work`, or `null` when it fails or does not settle within `ms`; the pending call is abandoned. */
export async function resolveWithin<T>(work: () => Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work().catch(() => null), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export interface DiagnosticSendDeps {
  /** Persists what capture holds in memory; runs first so local durability never waits on the network. */
  flush(): void;
  readLog(): string;
  readCrash(): CrashMarker | null;
  collectHostLogs(): Promise<CollectedHostLogs>;
  environment(hostVersions: readonly string[]): string;
  /** Signed-in email for exact-value redaction, or `null`. */
  email(): Promise<string | null>;
  context(): FeedbackContext;
  transport: DiagnosticTransport;
  review?: (report: DiagnosticReportCreate, send: () => Promise<DiagnosticSendResult>) => Promise<DiagnosticSendResult>;
  now(): Date;
}

/**
 * Builds, redacts and uploads one report; never throws. The transport is checked before any
 * connection is opened, so a build without an account service neither contacts saved computers nor
 * the account API.
 */
export async function runDiagnosticSend(
  deps: DiagnosticSendDeps,
  trigger: DiagnosticTrigger,
  options: { includeCrash?: boolean; note?: string; feedbackId?: string } = {},
): Promise<DiagnosticSendResult> {
  try {
    deps.flush();
    if (!deps.transport.signedIn && !deps.transport.anonymous) return "not-configured";
    const crash = options.includeCrash ? deps.readCrash() : null;
    const hosts = await deps.collectHostLogs();
    const report: DiagnosticReportCreate | null = buildDiagnosticReport({
      trigger,
      log: deps.readLog(),
      crash,
      environment: deps.environment(hosts.hostVersions),
      hostSections: hosts.sections,
      email: await deps.email(),
      note: options.note,
      feedbackId: options.feedbackId,
      context: deps.context(),
      now: deps.now(),
    });
    if (report && deps.review) return await deps.review(report, () => sendDiagnosticReport(report, deps.transport));
    return await sendDiagnosticReport(report, deps.transport);
  } catch {
    return "failed";
  }
}
