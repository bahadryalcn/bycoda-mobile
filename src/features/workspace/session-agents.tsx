import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import type { HostSession } from "./wire";
import { useHostClient, useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { HostSessionSummary } from "@/domain/types";
import type { DeviceSummary } from "../tools/types";
import { childSessions } from "./subagent-sessions-model";
import { childListInterval, readChildSummaries } from "./session-children-read";
import { listAgents } from "./agents-model";
import { AgentsSheet } from "./agents-sheet";
import { SessionActivityBar } from "./session-activity-bar";
import { SessionBrowser } from "./session-browser";
import { SessionDeviceSheet } from "./session-device-sheet";
import { deriveSessionActivity } from "./session-activity-model";
import { BROWSER_HOLDER_CAPABILITY, DEVICE_HOLDER_CAPABILITY, browserHostLabel, resolveHolders } from "./session-activity-holders";
import type { TranscriptBlockProps } from "./session-types";

type Props = Pick<TranscriptBlockProps, "scope" | "disabled" | "onCommand"> & {
  session: HostSession | undefined;
  /** Operating controls rendered beside the queue above the composer. */
  children: (activity: ReactNode) => ReactNode;
};

/** How long "Done" stays after a run ends. */
const DONE_MS = 4000;
/** Holder polling is modest: the bar only needs to notice a device or browser being taken or released. */
const HOLDER_POLL_MS = 6000;

/** The session activity strip and the sheets it opens; each keeps its existing access-aware owner. */
export function SessionAgents({ session, children: operations, ...props }: Props) {
  const client = useHostClient();
  const machine = useActiveMachine();
  const { scope } = props;
  const blocks = session?.session.blocks;
  const live = session?.status === "running";
  const context = useMemo(() => client && session ? { client, machineId: scope.machineId, projectId: session.projectId, sessionId: scope.sessionId,
    cwd: session.session.worktreeCwd || session.session.cwd } : undefined,
  [client, scope.machineId, scope.sessionId, session?.projectId, session?.session.cwd, session?.session.worktreeCwd]);
  const [sheet, setSheet] = useState<"agents" | "device" | "browser">();
  const [justFinished, setJustFinished] = useState(false);
  const wasLive = useRef(live);
  // Arms "Done" when a run that was live ends, and clears it after a moment or when work resumes.
  useEffect(() => {
    const ended = wasLive.current && !live;
    wasLive.current = live;
    if (!ended) { if (live) setJustFinished(false); return; }
    setJustFinished(true);
    const timer = setTimeout(() => setJustFinished(false), DONE_MS);
    return () => clearTimeout(timer);
  }, [live]);
  const projectId = session?.projectId;
  // A delegate's result turn is the only trace a bycoda-delegated child leaves in the transcript; without
  // it a reopened finished session never read its children and the agents strip disappeared.
  const hasAgents = useMemo(() => listAgents(blocks).length > 0 || !!blocks?.some((block) => block.author?.kind === "delegation"), [blocks]);
  // Child sessions may be created without an inline agent block. Discover them while working with a
  // read scoped to this parent (access-aware, foreground-only query owner) rather than the project
  // list. The key stays under ["sessions", projectId], so session writes still invalidate it.
  const siblings = useHostQuery<HostSessionSummary[]>(["sessions", projectId, "children", scope.sessionId], "sessions.list", { projectId, parentSessionId: scope.sessionId }, {
    enabled: !!projectId && (live || sheet === "agents" || hasAgents),
    interval: live ? (rows) => childListInterval(rows, scope.sessionId) : undefined,
    queryFn: (client, signal) => readChildSummaries(client, projectId!, scope.sessionId, signal),
  });
  const children = useMemo(() => childSessions(siblings.data, scope.sessionId), [siblings.data, scope.sessionId]);
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
    enabled: !!projectId && engaged && deviceSupported, interval: HOLDER_POLL_MS,
  });
  // Agents drive a browser per session; without the session id the Host answers for the owner-wide one.
  const browserStatus = useHostQuery<unknown>(["session-browser-holder", projectId, scope.sessionId], "browser.status", { projectId, sessionId: scope.sessionId }, {
    enabled: !!projectId && engaged && browserSupported, interval: HOLDER_POLL_MS,
  });
  const holders = resolveHolders({ capabilities, sessionId: scope.sessionId, live: engaged, blocks, devices: devices.data?.devices, browserStatus: browserStatus.data });
  const device = holders.device && { name: devices.data?.devices.find((row) => row.id === holders.device?.deviceId)?.name,
    platform: devices.data?.devices.find((row) => row.id === holders.device?.deviceId)?.platform };
  const browser = holders.browser && { host: browserHostLabel(holders.browser.url) };
  const bar = <SessionActivityBar activity={activity} device={device} browser={browser}
    onAgents={() => setSheet("agents")} onDevice={() => setSheet("device")} onBrowser={() => setSheet("browser")} />;
  const close = () => setSheet(undefined);
  return (
    <>
      {operations(bar)}
      {sheet === "agents" ? <View><AgentsSheet blocks={blocks} childRuns={children} childrenQuery={siblings} live={!!live} onClose={close} {...props} runId={session?.runId} parentProvider={session?.session.harness} context={context} /></View> : null}
      {sheet === "device" && projectId ? <SessionDeviceSheet projectId={projectId} deviceId={holders.device?.deviceId} onClose={close} /> : null}
      {sheet === "browser" && projectId ? <SessionBrowser key={`${scope.machineId}:${projectId}:${scope.sessionId}`} scope={scope} projectId={projectId} onClose={close} /> : null}
    </>
  );
}
