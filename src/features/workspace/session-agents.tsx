import { useState, type ReactNode } from "react";
import type { HostSession } from "./wire";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { DeviceSummary } from "../tools/types";
import { useSessionAgentRuns } from "./session-agent-runs";
import { SessionActivityBar } from "./session-activity-bar";
import { useStatusClusterPresent } from "./session-status-cluster-context";
import { useJustFinished } from "./use-just-finished";
import { SessionBrowser } from "./session-browser";
import { SessionDeviceSheet } from "./session-device-sheet";
import { deriveSessionActivity } from "./session-activity-model";
import { BROWSER_HOLDER_CAPABILITY, DEVICE_HOLDER_CAPABILITY, browserHostLabel, heldBrowserFrom, heldDeviceFrom, holderPollInterval, resolveHolders } from "./session-activity-holders";
import type { TranscriptBlockProps } from "./session-types";

type Props = Pick<TranscriptBlockProps, "scope" | "disabled" | "onCommand"> & {
  session: HostSession | undefined;
  /** Operating controls rendered beside the queue above the composer. */
  children: (activity: ReactNode) => ReactNode;
};


const NO_CHILDREN: never[] = [];

/**
 * The strip above the composer and the sheets it opens: the activity line with the device and
 * browser in use. A child session's status bar sits outside this hideable row (see the composer). Subagents live in the transcript and its
 * floating pill; their children read belongs to `SessionAgentRunsProvider`.
 */
export function SessionAgents({ session, children: operations, ...props }: Props) {
  const machine = useActiveMachine();
  const { scope } = props;
  const blocks = session?.session.blocks;
  const live = session?.status === "running";
  const [sheet, setSheet] = useState<"device" | "browser">();
  // On the session screen the floating status cluster owns the run state, "Done" included.
  const clusterOwnsState = useStatusClusterPresent();
  const justFinished = useJustFinished(!!live) && !clusterOwnsState;
  const projectId = session?.projectId;
  const children = useSessionAgentRuns()?.children ?? NO_CHILDREN;
  const activity = deriveSessionActivity({
    blocks, live: !!live, children, justFinished,
    pendingQuestion: !!session?.session.pendingQuestion,
    backgroundTasks: session?.session.backgroundTasks, backgroundAgents: session?.session.backgroundAgents,
  });
  // Working, waiting on agents and needing an answer all keep the agent's hold on a device or browser alive.
  const engaged = !!live || activity.state === "working" || activity.state === "waiting" || activity.state === "needs-input";
  const capabilities = machine?.capabilities;
  const deviceSupported = !!capabilities?.includes(DEVICE_HOLDER_CAPABILITY), browserSupported = !!capabilities?.includes(BROWSER_HOLDER_CAPABILITY);
  // Holder reads share the Devices tool's list cache and run only while this session is engaged.
  const devices = useHostQuery<{ devices: DeviceSummary[]; errors: string[] }>(["devices", "list"], "devices.list", { projectId }, {
    enabled: !!projectId && engaged && deviceSupported,
    interval: (data) => holderPollInterval("device", blocks, !!heldDeviceFrom(data?.devices, scope.sessionId)),
  });
  // Agents drive a browser per session; without the session id the Host answers for the owner-wide one.
  const browserStatus = useHostQuery<unknown>(["session-browser-holder", projectId, scope.sessionId], "browser.status", { projectId, sessionId: scope.sessionId }, {
    enabled: !!projectId && engaged && browserSupported,
    interval: (data) => holderPollInterval("browser", blocks, !!heldBrowserFrom(data, scope.sessionId)),
  });
  const holders = resolveHolders({ capabilities, sessionId: scope.sessionId, live: engaged, blocks, devices: devices.data?.devices, browserStatus: browserStatus.data });
  const device = holders.device && { name: devices.data?.devices.find((row) => row.id === holders.device?.deviceId)?.name,
    platform: devices.data?.devices.find((row) => row.id === holders.device?.deviceId)?.platform };
  const browser = holders.browser && { host: browserHostLabel(holders.browser.url) };
  const bar = <SessionActivityBar activity={activity} device={device} browser={browser} showState={!clusterOwnsState}
    onDevice={() => setSheet("device")} onBrowser={() => setSheet("browser")} />;
  const close = () => setSheet(undefined);
  return (
    <>
      {operations(bar)}
      {sheet === "device" && projectId ? <SessionDeviceSheet projectId={projectId} deviceId={holders.device?.deviceId} onClose={close} /> : null}
      {sheet === "browser" && projectId ? <SessionBrowser key={`${scope.machineId}:${projectId}:${scope.sessionId}`} scope={scope} projectId={projectId} onClose={close} /> : null}
    </>
  );
}
