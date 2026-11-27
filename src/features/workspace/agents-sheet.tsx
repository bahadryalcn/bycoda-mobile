import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Body } from "@/ui/typography";
import { Button, Empty, QueryState, SectionHeader, Sheet, StateView } from "@/ui/primitives";
import { getQueryPresentation, type QueryLike } from "@/ui/query-presentation";
import { useConnectionScope } from "@/state/connection-scope";
import { usePrivateContentAccess } from "@/ui/private-access";
import { ChatToolbarAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { metrics, space } from "@/ui/tokens";
import { useMachines } from "@/state/machines";
import type { Block } from "@/domain/types";
import { groupAgents, type AgentListItem } from "./agents-model";
import { agentCountText, sessionAgentEntries } from "./session-activity-model";
import { SubagentDetails } from "./subagent-details";
import { useSessionBlock } from "./session-queries";
import { subagentStopOffered } from "./subagent-model";
import { SubagentRunRow } from "./subagent-run-row";
import { anyLiveRun, childRunView, countRuns, runTone, settleEarlierTurnRuns, subagentRunView, type SubagentRunView } from "./subagent-run-model";
import { useElapsedNow } from "./use-elapsed-now";
import type { ChildSessionEntry } from "./subagent-sessions-model";
import type { TranscriptBlockProps } from "./session-types";
import { RecordAccessUnavailable } from "./unavailable-state";
import { pushOnce } from "@/ui/navigation";

type Props = Pick<TranscriptBlockProps, "scope" | "runId" | "disabled" | "onCommand" | "context" | "parentProvider"> & {
  /** The session revision a full block is read at; a run the Host sent without its content is read first. */
  getRevision?: () => number;
  blocks: readonly Block[] | undefined;
  /** Delegated runs with their own session; tapping opens that session. */
  childRuns?: readonly ChildSessionEntry[];
  childrenQuery?: QueryLike;
  /** The run is active; decides whether an unfinished call counts as running. */
  live?: boolean;
  onClose: () => void;
};

const NO_CHILDREN: readonly ChildSessionEntry[] = [];
const noRevision = () => 0;

/**
 * A run's details as the transcript opens them: a block the Host sent without its full content
 * (a long run's steps and report) is read first, so the sheet never shows a run as empty.
 */
function SheetRunDetails({ block, getRevision, ...props }: Omit<Props, "blocks" | "childRuns" | "childrenQuery" | "live" | "onClose"> &
  { block: Block; getRevision: () => number; interrupted: boolean; requestStop: boolean }) {
  const detail = useSessionBlock({ scope: props.scope, blockId: block.id, getRevision, digest: block.remoteContent?.digest, enabled: !!block.remoteContent });
  if (block.remoteContent && !detail.data) return <QueryState query={detail} loading="inline" compact />;
  return <SubagentDetails block={detail.data ?? block} {...props} />;
}

type ListItem =
  | AgentListItem
  | { kind: "child"; id: string; child: ChildSessionEntry };

/**
 * Every subagent of the session in the transcript's row anatomy, each with its own provider mark;
 * tapping one opens its steps and report with a way back to the list, a separate session opens
 * that session, and a running run offers Stop through the details' review.
 */
export function AgentsSheet({ blocks, childRuns: children = NO_CHILDREN, childrenQuery, live = false, onClose, getRevision = noRevision, ...props }: Props) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const capabilities = useMachines((state) => state.machines.find((entry) => entry.id === props.scope.machineId)?.capabilities);
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
  const childRows = errorKind === "auth" || errorKind === "identity" ? NO_CHILDREN : children;
  const latest = useRef({ readable, access, childRows, onClose });
  // Handlers read the committed values; writing them after commit keeps this sheet compiler-memoized.
  useLayoutEffect(() => { latest.current = { readable, access, childRows, onClose }; });
  const current = () => mounted.current && !closed.current && opening.connection.isCurrent() &&
    latest.current.readable && latest.current.access.allowed && latest.current.access.check();
  const close = () => {
    if (!mounted.current || closed.current) return;
    closed.current = true;
    latest.current.onClose();
  };
  const [selectedId, setSelectedId] = useState<string>();
  // The run whose details open straight at the stop review.
  const [stopId, setStopId] = useState<string>();
  // An older turn's unfinished run stays settled while a later turn works, as in the transcript.
  const entries = settleEarlierTurnRuns(sessionAgentEntries(blocks, childRows, live), blocks, live);
  // Each run's block and row, built once per transcript or child change rather than per row on every clock beat.
  const { parentProvider } = props;
  const runViews = useMemo(() => {
    const byId = new Map<string, { block: Block; view: SubagentRunView }>();
    for (const block of blocks ?? [])
      if (block.agentRun && !block.internal && !byId.has(block.id))
        byId.set(block.id, { block, view: subagentRunView(block, { live, children: childRows, parentProvider }) });
    return byId;
  }, [blocks, live, childRows, parentProvider]);
  const counts = countRuns([...entries.map((entry) => entry.state), ...childRows.map((child) => child.state)]);
  const summary = agentCountText(counts, copy);
  // A running child session alone keeps the clock going, so its row's elapsed never freezes.
  const running = anyLiveRun([...entries.map((entry) => entry.state), ...childRows.map((child) => child.state)]);
  const now = useElapsedNow(readable && running && !selectedId);
  const selected = selectedId ? blocks?.find((block) => block.id === selectedId && !!block.agentRun && !block.internal) : undefined;
  const items: ListItem[] = groupAgents(entries, copy("Çalışıyor", "Running"), copy("Tamamlananlar", "Finished"));
  if (childRows.length) {
    items.unshift(
      { kind: "heading", id: "h:children", label: copy("Ayrı oturumlar", "Separate sessions") },
      ...childRows.map((child): ListItem => ({ kind: "child", id: `child:${child.sessionId}`, child })),
    );
  }
  const query = childrenQuery && { ...childrenQuery, data: items.length ? items : childrenQuery.data };
  const phase = query ? getQueryPresentation(query) : "idle";
  const queryFeedback = query && phase !== "idle" && phase !== "ready" ? <QueryState query={query} loading="inline" compact /> : null;
  return (
    <Sheet visible size="full" scroll={false} onClose={close}
      title={readable && selectedId ? selected?.agentRun?.name || copy("Alt ajan ayrıntıları", "Subagent details") : copy("Ajanlar", "Agents")}
      headerAction={readable && selectedId ? <ChatToolbarAction label={copy("Ajanlar", "Agents")} onPress={() => { if (current()) { setSelectedId(undefined); setStopId(undefined); } }} /> : undefined}>
      {!readable ? <RecordAccessUnavailable /> : selected ? <SheetRunDetails key={selected.id} block={selected} getRevision={getRevision} {...props}
        requestStop={stopId === selected.id}
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
            const divider = separator ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator } : undefined;
            if (item.kind === "child") return <View style={divider}><SubagentRunRow view={childRunView(item.child, props.parentProvider)} now={now} onPress={() => {
              const { sessionId, projectId } = item.child;
              if (!current() || !latest.current.childRows.some((child) => child.sessionId === sessionId && child.projectId === projectId)) return;
              close();
              pushOnce({ pathname: "/session/[id]", params: { id: sessionId, machineId: opening.machineId, projectId } });
            }} /></View>;
            const run = runViews.get(item.id);
            if (!run) return null;
            const { block } = run;
            // The shared row from the block; the counted entry's state wins (an unfinished run reads interrupted after the parent).
            const view: SubagentRunView = run.view.state === item.entry.state ? run.view : { ...run.view, state: item.entry.state, tone: runTone(item.entry.state) };
            const stoppable = subagentStopOffered({ block, runId: props.runId, parentProvider: props.parentProvider, capabilities, disabled: props.disabled,
              interrupted: item.entry.state === "interrupted" });
            return <View style={divider}><SubagentRunRow view={view} now={now} onPress={() => { if (current()) setSelectedId(item.id); }}
              action={stoppable ? <Button label={copy("Durdur", "Stop")} tone="danger" density="compact" onPress={() => {
                if (!current()) return;
                setStopId(item.id);
                setSelectedId(item.id);
              }} /> : undefined} /></View>;
          }}
          ListEmptyComponent={queryFeedback ?? <Empty compact={false} illustration="no-sessions" title={copy("Alt ajan yok", "No subagents")} detail={copy("Bu oturumda alt ajan çalışmadı. Ajan başlatıldığında burada görünür.", "No subagents have run in this session. They appear here when one starts.")} />} />
      )}
    </Sheet>
  );
}
