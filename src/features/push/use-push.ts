import { logDiagnostic } from "../diagnostics/diagnostic-log";
import { useEffect, useRef, useState } from "react";
import { router, useRootNavigationState } from "expo-router";
import { useHostClient } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useSecurity } from "@/state/security";
import { useCopy } from "@/ui/copy";
import { notifications, readDevicePermission } from "../permissions/device-permissions";
import { PUSH_CAPABILITY, pushTarget, usePushPreferences, usePushStatus, type PushTarget } from "./push-model";
import { expoProjectId, expoPushToken, pushRegistration } from "./push-registration";

/** What each computer last accepted in this app run, so focus changes do not re-send it. */
const accepted = new Map<string, string>();

/**
 * Keeps the active computer's registration in step with this phone's
 * permission, token and choices. Turning pushes off unregisters; a computer
 * without the capability is reported, not retried.
 */
export function usePushRegistration() {
  const client = useHostClient();
  const machine = useActiveMachine();
  const copy = useCopy();
  const active = useSecurity((state) => state.appState === "active");
  const preferences = usePushPreferences();
  const setStatus = usePushStatus((state) => state.set);
  const wording = JSON.stringify(pushRegistration("", "", preferences, copy).texts);
  useEffect(() => {
    if (!client || !machine || !preferences.hydrated || !active) return;
    if (!machine.capabilities?.includes(PUSH_CAPABILITY)) {
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
      if (!(await readDevicePermission("notifications")).granted) return { state: "permission" } as const;
      const projectId = expoProjectId();
      if (!projectId) return { state: "unconfigured" } as const;
      const params = pushRegistration(await expoPushToken(projectId), machine.name, preferences, copy);
      const signature = JSON.stringify(params);
      if (accepted.get(machine.id) !== signature) {
        await client.request("push.register", params);
        accepted.set(machine.id, signature);
      }
      return { state: "registered" } as const;
    };
    run().then(
      (status) => { logDiagnostic("info", "mobile.push", "registration", { state: status.state }); if (current) setStatus(status); },
      (error: unknown) => { logDiagnostic("warn", "mobile.push", "registration failed", { error: error instanceof Error ? error.name : "unknown" }); if (current) setStatus({ state: "error", error }); },
    );
    return () => { current = false; };
    // `wording` covers the copy language; the other values are listed individually.
  }, [client, machine?.id, machine?.name, machine?.capabilities, preferences.hydrated, preferences.enabled,
    preferences.events, preferences.assistantUrgentDuringQuiet, active, wording, setStatus]);
}

/** Opens the conversation a tapped push points to, switching computers when needed. */
export function usePushResponses() {
  const routerReady = !!useRootNavigationState()?.key;
  const [target, setTarget] = useState<PushTarget | null>(null);
  const consumedInitial = useRef(false);
  useEffect(() => {
    let subscription: { remove: () => void } | undefined;
    let disposed = false;
    void notifications().then(async (api) => {
      if (disposed) return;
      subscription = api.addNotificationResponseReceivedListener((response) => {
        setTarget(pushTarget(response.notification.request.content.data));
      });
      if (consumedInitial.current) return;
      consumedInitial.current = true;
      const initial = await api.getLastNotificationResponseAsync();
      if (!disposed && initial) setTarget(pushTarget(initial.notification.request.content.data));
    }).catch(() => {
      // Without the native module (Expo Go, web) taps simply open the app.
    });
    return () => { disposed = true; subscription?.remove(); };
  }, []);
  useEffect(() => {
    if (!routerReady || !target) return;
    setTarget(null);
    const machines = useMachines.getState();
    const machine = machines.machines.find((entry) => entry.environmentId === target.environmentId);
    // A computer this phone no longer pairs with opens nothing.
    if (!machine) return;
    if (machines.activeId !== machine.id) machines.selectMachine(machine.id);
    if (target.kind === "approval") router.push({ pathname: "/approvals", params: { focus: target.approvalId } });
    else if (target.kind === "assistant")
      router.push({
        pathname: "/assistant",
        params: { ...(target.jobId ? { job: target.jobId } : {}), ...(target.questions ? { questions: "1" } : {}) },
      });
    else
      router.push({
        pathname: "/session/[id]",
        params: { id: target.sessionId, machineId: machine.id, ...(target.projectId ? { projectId: target.projectId } : {}) },
      });
  }, [routerReady, target]);
}
