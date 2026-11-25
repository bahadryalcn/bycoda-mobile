import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import type { DiagnosticReportCreate } from "../account/contracts";
import type { DiagnosticMode } from "./diagnostic-prefs";
import type { DiagnosticSendResult } from "./diagnostic-report";
import { readGzipBase64 } from "./diagnostic-gzip";

type Details = {
  id: number;
  destination: string;
  linkedToAccount: boolean;
  log: string;
  metadata: string;
};
type Pending = Details & {
  automatic: boolean;
  inspect(open: boolean): void;
  resetTimer(): void;
  decide(send: boolean): void;
};
type Receipt = Details & { sentAt: number };

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const queue: Pending[] = [];
let receipt: Receipt | null = null;
let sequence = 0;
let show = true;
let active = false;
let generation = 0;
const key = "bycoda.diagnostics.receipts";

export const subscribeDiagnosticSharing = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const diagnosticPending = () => queue[0] ?? null;
export const diagnosticReceipt = () => receipt;
export const diagnosticReceiptsShown = () => show;
export const diagnosticSharingGeneration = () => generation;
export function dismissDiagnosticReceipt() {
  receipt = null;
  notify();
}

export async function setDiagnosticReceiptsShown(value: boolean) {
  show = value;
  if (!value) receipt = null;
  notify();
  await AsyncStorage.setItem(key, value ? "show" : "hide");
}

export async function hydrateDiagnosticReceipts() {
  const stored = await AsyncStorage.getItem(key);
  if (stored === "hide" && show) {
    show = false;
    dismissDiagnosticReceipt();
  }
}

export function mountDiagnosticSharing() {
  active = true;
  const app = AppState.addEventListener("change", () => queue[0]?.resetTimer());
  return () => {
    active = false;
    generation++;
    app.remove();
    for (const pending of [...queue]) pending.decide(false);
    dismissDiagnosticReceipt();
  };
}

export async function reviewDiagnosticSharing(
  report: DiagnosticReportCreate,
  destination: string,
  linkedToAccount: boolean,
  preparedFor: number,
  mode: () => DiagnosticMode,
  send: () => Promise<DiagnosticSendResult>,
): Promise<DiagnosticSendResult> {
  const current = mode();
  if (!active || preparedFor !== generation) return "failed";
  if (current === "off") return "declined";
  const { content, ...metadata } = report;
  const details: Details = {
    id: ++sequence,
    destination,
    linkedToAccount,
    log: readGzipBase64(content.data),
    metadata: JSON.stringify({ ...metadata, content: { encoding: content.encoding, file: "diagnostics.log" } }, null, 2),
  };
  const approved = await new Promise<boolean>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inspected = false;
    const pending: Pending = {
      ...details,
      automatic: current === "auto",
      inspect(open) {
        inspected = open;
        pending.resetTimer();
      },
      resetTimer() {
        clearTimeout(timer);
        if (pending.automatic && !inspected && queue[0] === pending && AppState.currentState === "active") {
          timer = setTimeout(() => {
            if (AppState.currentState === "active") pending.decide(mode() === "auto");
          }, 10_000);
        }
      },
      decide(value) {
        const index = queue.indexOf(pending);
        if (index < 0) return;
        clearTimeout(timer);
        queue.splice(index, 1);
        if (index === 0) queue[0]?.resetTimer();
        notify();
        resolve(value);
      },
    };
    queue.push(pending);
    pending.inspect(false);
    notify();
  });
  if (!active || preparedFor !== generation) return "failed";
  if (!approved || mode() === "off") return "declined";
  const result = await send();
  if (result === "sent" && active && show && preparedFor === generation) {
    receipt = { ...details, sentAt: Date.now() };
    notify();
  }
  return result;
}
