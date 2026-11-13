import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { AppState, Appearance, PixelRatio, Platform } from "react-native";
import * as Application from "expo-application";
import { getCalendars, getLocales } from "expo-localization";
import NetInfo from "@react-native-community/netinfo";
import { useMachines } from "../../state/machines";
import { collectEnvironment } from "./diagnostic-environment";
import { collectConnectedHostLogs } from "./host-log-transport";
import { logDiagnostic } from "./diagnostic-log";
import {
  createAccountClient,
  type DiagnosticReportCreate,
  type DiagnosticTrigger,
} from "../account/contracts";
import { accountConfig } from "../account/model/config";
import { readDeviceInfo } from "../account/model/device-info";
import type { AccountState } from "../account/ui/account-context";
import { installDiagnosticCapture, readCrashMarker, type DiagnosticCapture } from "./diagnostic-capture";
import { CRASH_MARKER } from "./diagnostic-files";
import { expoDiagnosticFiles } from "./expo-diagnostic-files";
import { createDiagnosticPrefs, createDiagnosticPreferenceStore } from "./diagnostic-prefs";
import { buildDiagnosticReport, sendDiagnosticReport, type DiagnosticSendResult } from "./diagnostic-report";

const files = expoDiagnosticFiles();
export const diagnosticPrefs = createDiagnosticPrefs(AsyncStorage);
let capture: DiagnosticCapture | null = null;

/** Installs log capture, the fatal-error marker and rejection tracking once, at app start. */
export function startDiagnostics(): void {
  if (capture || process.env.EXPO_OS === "web") return;
  const global = globalThis as {
    ErrorUtils?: Parameters<typeof installDiagnosticCapture>[0]["errorUtils"];
    HermesInternal?: {
      enablePromiseRejectionTracker?: (options: {
        allRejections: boolean;
        onUnhandled: (id: number, error: unknown) => void;
        onHandled: (id: number) => void;
      }) => void;
    };
  };
  capture = installDiagnosticCapture({
    files,
    console,
    errorUtils: global.ErrorUtils,
    appVersion: Constants.expoConfig?.version ?? "0.0.0",
    // Development keeps React Native's own tracker and its warnings.
    trackRejections:
      !__DEV__ && global.HermesInternal?.enablePromiseRejectionTracker
        ? (onUnhandled) =>
            global.HermesInternal!.enablePromiseRejectionTracker!({
              allRejections: true,
              onUnhandled: (_id, error) => onUnhandled(error),
              onHandled: () => undefined,
            })
        : null,
  });
  AppState.addEventListener("change", (state) => {
    logDiagnostic("info", "mobile.app", "app state", { state });
    if (state !== "active") capture?.flush();
  });
  // Connectivity changes only: no network names or addresses.
  let network = "";
  NetInfo.addEventListener((state) => {
    const key = `${state.type}:${state.isConnected}:${state.isInternetReachable}`;
    if (key === network) return;
    network = key;
    logDiagnostic("info", "mobile.network", "connectivity changed", {
      type: state.type,
      connected: state.isConnected,
      reachable: state.isInternetReachable,
    });
  });
}

function environmentText(account: AccountState, hostVersions: readonly string[]): string {
  const android = process.env.EXPO_OS === "android";
  const constants = Platform.constants as { Model?: unknown; Brand?: unknown } | undefined;
  return collectEnvironment({
    appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version,
    buildNumber: Application.nativeBuildVersion,
    runtimeVersion: typeof Constants.expoConfig?.runtimeVersion === "string" ? Constants.expoConfig.runtimeVersion : undefined,
    os: android ? "Android" : "iOS",
    osVersion: Platform.Version,
    brand: android && typeof constants?.Brand === "string" ? constants.Brand : undefined,
    model: android && typeof constants?.Model === "string" ? constants.Model : undefined,
    locale: getLocales()[0]?.languageTag,
    timeZone: getCalendars()[0]?.timeZone,
    fontScale: PixelRatio.getFontScale(),
    colorScheme: Appearance.getColorScheme(),
    hermes: !!(globalThis as { HermesInternal?: unknown }).HermesInternal,
    signedIn: account.status === "signedIn",
    pairedComputers: useMachines.getState().machines.length,
    hostVersions,
  });
}

export const hasCrashMarker = () => readCrashMarker(files) !== null;
export const clearCrashMarker = () => files.remove(CRASH_MARKER);
export const crashMarker = () => readCrashMarker(files);

export const useDiagnosticPrefs = createDiagnosticPreferenceStore(diagnosticPrefs);

async function signedInEmail(account: AccountState): Promise<string | null> {
  if (account.status !== "signedIn" || !account.runtime) return null;
  try {
    return (await account.runtime.client.getMe()).user.email;
  } catch {
    return null;
  }
}

/** Client for auth-"none" routes: the contract client sends no token when none is needed. */
function anonymousAccountClient() {
  return accountConfig.apiUrl
    ? createAccountClient({ baseUrl: accountConfig.apiUrl, getAccessToken: async () => null })
    : null;
}

/** Feedback goes through the signed-in client when there is one, else the anonymous client. */
export function feedbackClient(account: AccountState) {
  const signedIn = account.status === "signedIn" && account.runtime ? account.runtime.client : null;
  return { signedIn: signedIn !== null, client: signedIn ?? anonymousAccountClient() };
}

/** Context of the app and system; the same fields device registration uses. */
export function feedbackContext() {
  const info = readDeviceInfo();
  return { appVersion: info.appVersion, platform: info.platform, osVersion: info.osVersion, channel: info.channel };
}

/** Builds, redacts and uploads a report signed in or anonymously; never throws. */
export async function sendDiagnostics(
  account: AccountState,
  trigger: DiagnosticTrigger,
  options: { includeCrash?: boolean; note?: string; feedbackId?: string } = {},
): Promise<DiagnosticSendResult> {
  try {
    capture?.flush();
    const crash = options.includeCrash ? readCrashMarker(files) : null;
    const hosts = await collectConnectedHostLogs();
    const info = readDeviceInfo();
    const report = buildDiagnosticReport({
      trigger,
      log: capture?.readLog() ?? "",
      crash,
      environment: environmentText(account, hosts.hostVersions),
      hostSections: hosts.sections,
      email: await signedInEmail(account),
      note: options.note,
      feedbackId: options.feedbackId,
      context: {
        appVersion: info.appVersion,
        platform: info.platform,
        osVersion: info.osVersion,
        channel: info.channel,
      },
      now: new Date(),
    });
    const signedIn =
      account.status === "signedIn" && account.runtime ? account.runtime.client : null;
    // The anonymous route is auth "none": the contract client sends no token when none is needed.
    const anonymousClient = anonymousAccountClient();
    return await sendDiagnosticReport(report, {
      signedIn: signedIn
        ? (body: DiagnosticReportCreate) => signedIn.sendDiagnosticReport({ body })
        : null,
      anonymous: anonymousClient
        ? (body: DiagnosticReportCreate) => anonymousClient.sendAnonymousDiagnosticReport({ body })
        : null,
    });
  } catch {
    return "failed";
  }
}
