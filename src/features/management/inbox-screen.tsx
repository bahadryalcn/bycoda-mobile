import { ScreenList } from "@/ui/screen-list";
import type { HostAttentionInbox, MobileInboxItem } from "@/domain/types";
import { router, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useInboxSeen } from "../inbox/inbox-seen-store";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Body, Notice, QueryState, Screen, ScreenHeader, SectionHeader, SegmentedControl, StateView } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { ProjectPicker } from "../workspace/project-picker";
import { useCopy } from "@/ui/copy";
import { RECORD_ACCESS_UNAVAILABLE } from "@/ui/record-access-copy";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import { getLocales } from "expo-localization";
import { resolveLocale } from "@/localization";
import { ProjectScopePill } from "../workspace/project-scope-pill";
import { useInboxLocalScope } from "../inbox/inbox-local-scope";
import { AttentionRow } from "../inbox/attention-row";
import { attentionPartial } from "../inbox/attention-partial";
import { groupAttention, isUrgentAttention, phoneAttentionItems } from "../inbox/attention-groups";
import { InboxBrowseMemoryProvider, useInboxBrowseMemory } from "../inbox/inbox-browse-memory-provider";
import { useInboxScrollMemory } from "../inbox/use-inbox-scroll-memory";
import { ProviderInboxScreen } from "../inbox/provider-inbox-screen";
import { View } from "react-native";
import { inboxRelativeTime } from "./inbox-time";
import { isInboxPrivateFailure } from "../inbox/provider-model";
import { PendingApprovalsRow } from "../inbox/pending-approvals-row";
import { NoComputerState } from "@/ui/no-computer";

const attentionRoutes = { task: "tasks", goal: "goals", automation: "automations", social: null, "pull-request": "tasks", session: "inbox" } as const;

/** Mail-style relative time ("5 dk", "2 sa", "dün") in the app language. */
function relativeTime(value: number, copy: ReturnType<typeof useCopy>) {
  const language = useMachines.getState().language;
  const locale = language === "system" ? resolveLocale(getLocales().map((entry) => entry.languageTag)) : language;
  return inboxRelativeTime(value, locale, copy);
}

export function InboxScreen() {
  const copy = useCopy();
  const { view } = useLocalSearchParams<{ view?: string }>();
  return (
    <InboxBrowseMemoryProvider><Screen scroll={false} title={copy("Gelen kutusu", "Inbox")} scopeControl={<InboxProjectScope />}>
      <InboxBody view={view} />
    </Screen></InboxBrowseMemoryProvider>
  );
}
/** Both Inbox modes read the one Inbox scope, so its pill sits in the shared page identity. */
function InboxProjectScope() {
  const { projectId, setProjectId } = useInboxLocalScope();
  return <ProjectScopePill allowAll={false} projectId={projectId} onChange={setProjectId} />;
}

/**
 * Two plainly named views of one project: agent work that waits for the owner, and the project's
 * issues and pull requests from connected services. A one-line caption says what the open view
 * holds. The Inbox always reads one project; an all-projects provider read fans out over every
 * repository on the desktop and could hold the list on its placeholder for minutes.
 */
function InboxBody({ view }: { view?: string }) {
  const copy = useCopy();
  const { colors, uiStyles } = useMobileTheme();
  const machine = useActiveMachine();
  const { projectId, setProjectId } = useInboxLocalScope();
  const [mode, setMode] = useState<"attention" | "providers">(view === "jira" || view === "issues" ? "providers" : "attention");
  const [choosingProject, setChoosingProject] = useState(false);
  if (machine && !projectId) return (
    <View style={{ flex: 1 }}>
      <StateView
        size="region"
        title={copy("Bir proje seç", "Choose a project")}
        description={copy("Gelen kutusu bir seferde bir projeyi gösterir. Takip etmek istediğin projeyi seç.",
          "The inbox shows one project at a time. Choose the project you want to follow.")}
        action={{ label: copy("Proje seçin", "Choose a project"), onPress: () => setChoosingProject(true) }}
      />
      {choosingProject ? <ProjectPicker key={machine.id} visible selectedId={projectId}
        onClose={() => setChoosingProject(false)}
        onSelect={(selected) => { setChoosingProject(false); setProjectId(selected.id); }} /> : null}
    </View>
  );
  return <>
    <ScreenHeader>
      <SegmentedControl
        hideLabel
        label={copy("Gelen kutusu", "Inbox")}
        value={mode}
        options={[
          { value: "attention", label: copy("Senin için", "For you") },
          { value: "providers", label: copy("Issue ve PR", "Issues & PRs") },
        ]}
        onChange={setMode}
      />
      <Body style={[uiStyles.caption, { color: colors.muted }]}>
        {mode === "providers"
          ? copy("Bu projenin GitHub, GitLab, Jira gibi bağlı servislerdeki issue ve pull request’leri.",
            "This project's issues and pull requests from connected services such as GitHub, GitLab and Jira.")
          : copy("Ajanların onayını, yanıtını veya yardımını bekleyen işler.",
            "Agent work waiting for your approval, answer or help.")}
      </Body>
    </ScreenHeader>
    {mode === "providers"
      ? <ProviderInboxScreen embedded openJira={view === "jira"} />
      : <AttentionInboxScreen />}
  </>;
}

function AttentionInboxScreen() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const { projectId, matches } = useInboxLocalScope();
  const selectProject = useMachines((state) => state.selectProject);
  const memory = useInboxBrowseMemory()?.attention ?? null;
  const origin = { machineId: machine?.id ?? "", projectId };
  const [initialView] = useState(() => memory?.read(origin));
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const ownsScope = () => !memory || memory.read(origin) !== undefined;
  const scopeCurrent = !!machine && ownsScope() && matches(origin);
  const query = useHostQuery<HostAttentionInbox>(
    ["inbox", projectId],
    "inbox.list",
    projectId ? { projectId } : {},
    // Focus and pull-to-refresh read at once; a watched list needs no faster background cadence.
    { interval: 15_000, enabled: scopeCurrent },
  );
  const readable = scopeCurrent && query.isEnabled !== false && query.fetchStatus !== "paused" && !isInboxPrivateFailure(query.error);
  const data = readable ? query.data : undefined;
  // The Host left projects out of this read: the rows are usable but not the whole queue.
  const partial = attentionPartial(data);
  const groups = useMemo(() => groupAttention(phoneAttentionItems(data?.items ?? [])), [data]);
  const rows = groups.ordered;
  const focused = useIsFocused();
  // Effect reason: items shown on the focused Inbox are seen, which clears the tab dot.
  useEffect(() => {
    if (focused && readable && machine && data) void useInboxSeen.getState().markSeen(machine.id, phoneAttentionItems(data.items));
  }, [focused, readable, machine, data]);
  const lease = useMemo(() => ({ active: false }), [readable, origin.machineId, origin.projectId]);
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  const latest = useRef({ readable, data, enabled: query.isEnabled !== false, refetch: query.refetch });
  latest.current = { readable, data, enabled: query.isEnabled !== false, refetch: query.refetch };
  const scrollMemory = useInboxScrollMemory<MobileInboxItem>(memory, origin, initialView?.offset ?? 0,
    data !== undefined, rows.length, { suspended: !readable });
  const current = () => mounted.current && ownsScope() && matches(origin);
  const refresh = () => {
    if (machine && current() && latest.current.enabled) return latest.current.refetch();
  };
  const open = (item: MobileInboxItem) => {
    if (!machine || !lease.active || !latest.current.readable || !current()) return;
    const target = latest.current.data?.items.find(candidate => candidate.id === item.id);
    if (!target || target.kind !== item.kind || target.projectId !== item.projectId || target.sessionId !== item.sessionId ||
      (!item.sessionId && !attentionRoutes[item.kind])) return;
    if (item.projectId) selectProject(item.projectId);
    if (item.sessionId) {
      if (machine)
        router.navigate({
          pathname: "/session/[id]",
          params: {
            id: item.sessionId,
            machineId: machine.id,
            ...(item.projectId ? { projectId: item.projectId } : {}),
          },
        });
    } else
      router.navigate(
        `/manage/${attentionRoutes[item.kind]}`,
      );
  };
  return <>
    <ScreenList<MobileInboxItem>
      {...scrollMemory.listProps}
      query={{...query, data, refetch: refresh}}
      refresh={refresh}
      data={rows}
      header={<>
        <PendingApprovalsRow />
        {partial ? <Notice tone="warning" retrying={query.isFetching}
        message={copy("Bazı projeler zamanında yanıt vermedi; onların bekleyen işleri burada görünmüyor olabilir.",
          "Some projects did not respond in time, so their attention items may be missing.")}
        onRetry={() => { void refresh(); }} /> : null}
      </>}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <>
          {!machine ? <NoComputerState /> :!scopeCurrent || query.isEnabled === false && !query.error ? (
            <StateView illustration="unreachable" title={copy("Bağlantı bekleniyor", "Waiting for a connection")}
              description={copy(...RECORD_ACCESS_UNAVAILABLE)} />
          ) : <QueryState size="region" query={{...query, data: query.error ? undefined : data, refetch: refresh}} empty={data !== undefined && !partial}
            emptyIllustration="inbox-empty"
            emptyTitle={copy("Bekleyen bir iş yok", "Nothing needs your attention")}
            emptyDetail={copy("Onaylar, sorular ve takılan işler burada görünür.", "Approvals, questions and stuck work show up here.")} />}
        </>
      }
      renderItem={({ item, index }) => {
        const urgent = isUrgentAttention(item);
        const first = index === 0 || isUrgentAttention(rows[index - 1]!) !== urgent;
        return (
          <View>
            {first ? <SectionHeader
              title={urgent ? copy("Senden bekleyenler", "Needs you now") : copy("Diğer işler", "Other activity")}
              count={urgent ? groups.now.length : groups.earlier.length} /> : null}
            <AttentionRow item={item} time={relativeTime(item.updatedAt, copy)} onPress={() => open(item)} />
          </View>
        );
      }}
    />
  </>;
}
