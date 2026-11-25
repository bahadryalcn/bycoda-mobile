import { useLayoutEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { FlatList, View } from "react-native";
import { AgentAvatar } from "@/ui/agent-avatar";
import { Body } from "@/ui/typography";
import { Badge, StatusText } from "@/ui/feedback";
import { Empty, NavigationRow, QueryState, SectionHeader, Sheet, StateView } from "@/ui/primitives";
import { getQueryPresentation, type QueryLike } from "@/ui/query-presentation";
import { useConnectionScope } from "@/state/connection-scope";
import { usePrivateContentAccess } from "@/ui/private-access";
import { ChatToolbarAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { iconSize, metrics, space } from "@/ui/tokens";
import type { Block } from "@/domain/types";
import { agentStateLabel } from "./agent-state";
import { groupAgents, type AgentEntry, type AgentListItem } from "./agents-model";
import { agentCountText, countAgents, sessionAgentEntries } from "./session-activity-model";
import { formatElapsed } from "./run-status-model";
import { SubagentDetails } from "./subagent-details";
import { useElapsedNow } from "./use-elapsed-now";
import type { ChildSessionEntry } from "./subagent-sessions-model";
import type { TranscriptBlockProps } from "./session-types";
import { RecordAccessUnavailable } from "./unavailable-state";

type Props = Pick<TranscriptBlockProps, "scope" | "runId" | "disabled" | "onCommand" | "context" | "parentProvider"> & {
  blocks: readonly Block[] | undefined;
  /** Delegated runs with their own session; tapping opens that session. */
  childRuns?: readonly ChildSessionEntry[];
  childrenQuery?: QueryLike;
  /** The run is active; decides whether an unfinished call counts as running. */
  live?: boolean;
  onClose: () => void;
};

type ListItem =
  | AgentListItem
  | { kind: "child"; id: string; child: ChildSessionEntry };

/** Every subagent of the session; tapping one opens its steps and report with a way back to the list. */
export function AgentsSheet({ blocks, childRuns: children = [], childrenQuery, live = false, onClose, ...props }: Props) {
  const copy = useCopy();
  const connection = useConnectionScope();
  const access = usePrivateContentAccess();
  const [opening] = useState(() => ({ connection, ...props.scope }));
  const mounted = useRef(false);
  const closed = useRef(false);
  // Retire retained navigation handlers when the agent sheet closes or unmounts.
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const readable = connection === opening.connection && opening.connection.review?.id === opening.machineId &&
    props.scope.machineId === opening.machineId && props.scope.sessionId === opening.sessionId &&
    opening.connection.isCurrent() && access.allowed && access.check();
  const errorKind = (childrenQuery?.error as { kind?: string } | undefined)?.kind;
  const childRows = errorKind === "auth" || errorKind === "identity" ? [] : children;
  const latest = useRef({ readable, access, childRows, onClose });
  latest.current = { readable, access, childRows, onClose };
  const current = () => mounted.current && !closed.current && opening.connection.isCurrent() &&
    latest.current.readable && latest.current.access.allowed && latest.current.access.check();
  const close = () => {
    if (!mounted.current || closed.current) return;
    closed.current = true;
    latest.current.onClose();
  };
  const [selectedId, setSelectedId] = useState<string>();
  const entries = sessionAgentEntries(blocks, childRows, live);
  const counts = countAgents(blocks, childRows, live);
  const summary = agentCountText(counts, copy);
  const running = entries.some((entry) => entry.state === "running");
  const now = useElapsedNow(readable && running && !selectedId);
  const selected = selectedId ? blocks?.find((block) => block.id === selectedId && !!block.agentRun && !block.internal) : undefined;
  const items: ListItem[] = groupAgents(entries, copy("Çalışıyor", "Running"), copy("Tamamlananlar", "Finished"));
  if (childRows.length) {
    items.unshift(
      { kind: "heading", id: "h:children", label: copy("Kendi başına çalışır", "Runs on its own") },
      ...childRows.map((child): ListItem => ({ kind: "child", id: `child:${child.sessionId}`, child })),
    );
  }
  const query = childrenQuery && { ...childrenQuery, data: items.length ? items : childrenQuery.data };
  const phase = query ? getQueryPresentation(query) : "idle";
  const queryFeedback = query && phase !== "idle" && phase !== "ready" ? <QueryState query={query} loading="inline" compact /> : null;
  return (
    <Sheet visible size="full" scroll={false} onClose={close}
      title={readable && selectedId ? selected?.agentRun?.name || copy("Alt ajan ayrıntıları", "Subagent details") : copy("Ajanlar", "Agents")}
      headerAction={readable && selectedId ? <ChatToolbarAction label={copy("Ajanlar", "Agents")} onPress={() => { if (current()) setSelectedId(undefined); }} /> : undefined}>
      {!readable ? <RecordAccessUnavailable /> : selected ? <SubagentDetails key={selected.id} block={selected} {...props}
        interrupted={entries.some((entry) => entry.id === selected.id && entry.state === "interrupted")} /> : selectedId ? (
          <StateView compact title={copy("İşlem gösterilemiyor", "Action unavailable")} />
        ) : (
        <FlatList data={items}
          ListHeaderComponent={items.length ? <>
            {summary ? <Body muted accessibilityLabel={agentCountText(counts, copy, true)} style={{ fontVariant: ["tabular-nums"] }}>{summary}</Body> : null}
            {queryFeedback}
          </> : undefined}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center", paddingHorizontal: space.screen, paddingBottom: space.lg, flexGrow: 1 }}
          renderItem={({ item, index }) => {
            // Flat rows with the group hairline; a later section keeps the shared group rhythm.
            if (item.kind === "heading") return <View style={{ paddingTop: index ? space.lg : 0 }}><SectionHeader title={item.label} /></View>;
            const separator = index < items.length - 1 && items[index + 1]?.kind !== "heading";
            if (item.kind === "child") return <ChildRow child={item.child} provider={props.parentProvider} separator={separator} onOpen={() => {
              const { sessionId, projectId } = item.child;
              if (!current() || !latest.current.childRows.some((child) => child.sessionId === sessionId && child.projectId === projectId)) return;
              close();
              router.push({ pathname: "/session/[id]", params: { id: sessionId, machineId: opening.machineId, projectId } });
            }} />;
            return <AgentRow entry={item.entry} now={now} provider={props.parentProvider} separator={separator} onPress={() => { if (current()) setSelectedId(item.id); }} />;
          }}
          ListEmptyComponent={queryFeedback ?? <Empty compact={false} illustration="no-sessions" title={copy("Alt ajan yok", "No subagents")} detail={copy("Bu oturumda alt ajan çalışmadı. Ajan başlatıldığında burada görünür.", "No subagents have run in this session. They appear here when one starts.")} />} />
      )}
    </Sheet>
  );
}

/**
 * Agent status in a list: the finished (normal) state is quiet text, running/stopped carry their
 * tone, and only a failure is a badge the owner should notice.
 */
function AgentStatus({ state, label }: { state: AgentEntry["state"]; label: string }) {
  if (state === "failed") return <Badge label={label} tone="danger" />;
  return <StatusText label={label} tone={state === "running" ? "live" : state === "stopped" || state === "interrupted" ? "warning" : "default"} />;
}

function ChildRow({ child, provider, separator, onOpen }: { child: ChildSessionEntry; provider: Props["parentProvider"]; separator: boolean; onOpen: () => void }) {
  const copy = useCopy();
  const label = agentStateLabel(child.state, copy);
  return (
    <NavigationRow label={child.title} labelLines={1} separator={separator}
      accessibilityLabel={[child.title, label, child.meta].filter(Boolean).join(". ")}
      icon={<AgentAvatar author={provider} size={iconSize.row} />}
      detail={child.meta || undefined} detailLines={2}
      trailing={<AgentStatus state={child.state} label={label} />}
      onPress={onOpen} />
  );
}

function AgentRow({ entry, now, provider, separator, onPress }: { entry: AgentEntry; now: number; provider: Props["parentProvider"]; separator: boolean; onPress: () => void }) {
  const copy = useCopy();
  const label = agentStateLabel(entry.state, copy);
  const end = entry.endedAt ?? (entry.state === "running" ? now : undefined);
  const elapsed = entry.startedAt !== undefined && end !== undefined ? formatElapsed(end - entry.startedAt) : undefined;
  const secondary = [elapsed, entry.meta].filter(Boolean).join(" · ");
  return (
    <NavigationRow label={entry.name} labelLines={1} separator={separator}
      accessibilityLabel={[entry.name, label, elapsed, entry.meta, entry.summary].filter(Boolean).join(". ")}
      icon={<AgentAvatar author={provider} size={iconSize.row} />}
      detail={secondary || undefined} detailLines={2}
      metadata={entry.summary} metadataLines={3}
      trailing={<AgentStatus state={entry.state} label={label} />}
      onPress={onPress} />
  );
}
