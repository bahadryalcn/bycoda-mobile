import { logDiagnostic } from "../diagnostics/diagnostic-log";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { withTimeout } from "../../../../src/shared/lib/withTimeout";
import { router, useRootNavigationState, type Href } from "expo-router";
import type { NotificationResponse } from "expo-notifications";
import { useHostClient } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useSecurity } from "@/state/security";
import { useCopy } from "@/ui/copy";
import { showToast } from "@/ui/primitives";
import { notifications, readDevicePermission, useNotificationPermissionRevision } from "../permissions/device-permissions";
import { suppressLastSessionRestore } from "../workspace/last-session";
import { PUSH_CAPABILITY, pushRoute, pushTarget, unmatchedPushNotice, usePushPreferences, usePushStatus, type PushTarget } from "./push-model";
import { expoProjectId, expoPushToken, onPushTokenRotated, pushRegistration } from "./push-registration";

/** What each computer last accepted in this app run, so focus changes do not re-send it. */
const accepted = new Map<string, string>();
type PendingPushResponse = { target: PushTarget; receipt: string | null; acknowledge: () => void };
const pushReceiptsKey = "bycoda.mobile.handled-push-responses.v1";
const pushReceiptLimit = 32;
const handledResponses = new Set<string>();
let receiptWrites = Promise.resolve();

function pushReceipt(response: NotificationResponse): string | null {
  const { request, date } = response.notification;
  const action = response.actionIdentifier;
  return request.identifier ? JSON.stringify([request.identifier, action, date]) : null;
}

function rememberResponse(receipt: string) {
  handledResponses.add(receipt);
  if (handledResponses.size > pushReceiptLimit) {
    const oldest = handledResponses.values().next().value;
    if (oldest !== undefined) handledResponses.delete(oldest);
  }
}

async function loadPushReceipts() {
  try {
    await receiptWrites;
    const raw = await withTimeout(AsyncStorage.getItem(pushReceiptsKey), 2000, "Notification receipt read");
    const entries: unknown = raw && JSON.parse(raw);
    if (!Array.isArray(entries)) return;
    for (const entry of entries.slice(-pushReceiptLimit)) {
      if (typeof entry === "string") rememberResponse(entry);
    }
  } catch {
    // Continue with receipts from this app run if storage is unavailable.
  }
}

function acknowledgePushResponse({ receipt, acknowledge }: PendingPushResponse) {
  if (!receipt) return;
  rememberResponse(receipt);
  const stored = JSON.stringify([...handledResponses]);
  receiptWrites = receiptWrites.then(() =>
    withTimeout(AsyncStorage.setItem(pushReceiptsKey, stored), 2000, "Notification receipt write"),
  ).catch(() => {});
  void receiptWrites.then(acknowledge);
}

/**
 * Keeps the active computer's registration in step with this phone's
 * permission, token and choices. Turning pushes off unregisters; a computer
 * without the capability is reported, not retried.
 */
export function usePushRegistration() {
  const client = useHostClient();
  const machine = useActiveMachine();
  const supported = machine?.capabilities?.includes(PUSH_CAPABILITY);
  const copy = useCopy();
  const active = useSecurity((state) => state.appState === "active");
  const preferences = usePushPreferences();
  const setStatus = usePushStatus((state) => state.set);
  const retryEpoch = usePushStatus((state) => state.retryEpoch);
  const permissionRevision = useNotificationPermissionRevision((state) => state.revision);
  const wording = JSON.stringify(pushRegistration("", "", preferences, copy).texts);
  const [tokenEpoch, setTokenEpoch] = useState(0);
  // The OS rotating the push token is the only reason to look the token up again; a rotation re-runs the registration below.
  useEffect(() => onPushTokenRotated(() => setTokenEpoch((epoch) => epoch + 1)), []);
  // Resume, an explicit retry, or a completed permission prompt rechecks the registration.
  useEffect(() => {
    if (!client || !machine || !preferences.hydrated || !active) return;
    if (!supported) {
      setStatus({ state: "unsupported" });
      return;
    }
    let current = true;
    const run = async () => {
      if (!preferences.enabled) {
        if (accepted.get(machine.id) !== "off") {
          await client.request("push.unregister", {});
          accepted.set(machine.id, "off");
        }
        return { state: "off" } as const;
      }
      if (usePushStatus.getState().status.state !== "registered") setStatus({ state: "checking" });
      const permission = await withTimeout(readDevicePermission("notifications"), 8_000, "Notification permission check");
      if (!current) return null;
      if (!permission.granted) return { state: "permission" } as const;
      const projectId = expoProjectId();
      if (!projectId) return { state: "unconfigured" } as const;
      const token = await expoPushToken(projectId);
      if (!current) return null;
      const params = pushRegistration(token, machine.name, preferences, copy);
      const signature = JSON.stringify(params);
      if (accepted.get(machine.id) !== signature) {
        await client.request("push.register", params);
        accepted.set(machine.id, signature);
      }
      return { state: "registered" } as const;
    };
    run().then(
      (status) => { if (current && status) { logDiagnostic("info", "mobile.push", "registration", { state: status.state }); setStatus(status); } },
      (error: unknown) => { logDiagnostic("warn", "mobile.push", "registration failed", { error: error instanceof Error ? error.name : "unknown" }); if (current) setStatus({ state: "error", error }); },
    );
    return () => { current = false; };
    // `wording` covers the copy language; the other values are listed individually.
  }, [client, machine?.id, machine?.name, supported, preferences.hydrated, preferences.enabled,
    preferences.events, preferences.assistantUrgentDuringQuiet, active, wording, tokenEpoch, permissionRevision, retryEpoch, setStatus]);
}

/** Opens the conversation a tapped push points to, switching computers when needed. */
export function usePushResponses() {
  const routerReady = !!useRootNavigationState()?.key;
  const copy = useCopy();
  const connectionsReady = useMachines((state) => state.hydrated && !state.connectionPending);
  const unlocked = useSecurity((state) => state.status === "unlocked" && state.appState === "active");
  const [pending, setPending] = useState<PendingPushResponse | null>(null);
  // Subscribe first so a new tap can supersede an outstanding cold-response read.
  useEffect(() => {
    let subscription: { remove: () => void } | undefined;
    let disposed = false;
    let receivedLive = false;
    const receiptsReady = loadPushReceipts();
    void notifications().then(async (api) => {
      if (disposed) return;
      const capture = (response: NotificationResponse): boolean => {
        const target = pushTarget(response.notification.request.content.data);
        if (!target) return false;
        suppressLastSessionRestore();
        const receipt = pushReceipt(response);
        const acknowledge = () => {
          try {
            // Compare without a JS async gap so a newer cached response stays available.
            const latest = api.getLastNotificationResponse();
            if (receipt && latest && pushReceipt(latest) === receipt) api.clearLastNotificationResponse();
          } catch {
            // A missing native cache API must not interrupt navigation.
          }
        };
        if (receipt && handledResponses.has(receipt)) {
          void receiptWrites.then(acknowledge);
          return false;
        }
        setPending({ target, receipt, acknowledge });
        return true;
      };
      subscription = api.addNotificationResponseReceivedListener((response) => {
        void receiptsReady.then(() => {
          if (!disposed && capture(response)) receivedLive = true;
        });
      });
      const initial = await api.getLastNotificationResponseAsync();
      await receiptsReady;
      if (!disposed && !receivedLive && initial) capture(initial);
    }).catch(() => {
      // Without the native module (Expo Go, web) taps simply open the app.
    });
    return () => { disposed = true; subscription?.remove(); };
  }, []);
  // Keep the intent until navigation and saved connection state both permit it.
  useEffect(() => {
    if (!routerReady || !unlocked || !connectionsReady || !pending) return;
    const machines = useMachines.getState();
    if (!machines.hydrated || machines.connectionPending) return;
    const { target, receipt } = pending;
    setPending(null);
    if (receipt && handledResponses.has(receipt)) return;
    const machine = machines.storageError ? undefined :
      machines.machines.find((entry) => entry.environmentId === target.environmentId);
    // A computer this phone no longer pairs with (or cannot read) opens nothing; say why, without naming it.
    if (!machine) {
      showToast({ tone: "warning", message: unmatchedPushNotice(machines.storageError, copy) });
      acknowledgePushResponse(pending);
      return;
    }
    if (machines.activeId !== machine.id) machines.selectMachine(machine.id);
    router.navigate(pushRoute(target, machine.id) as Href);
    acknowledgePushResponse(pending);
  }, [routerReady, unlocked, connectionsReady, pending, copy]);
}
