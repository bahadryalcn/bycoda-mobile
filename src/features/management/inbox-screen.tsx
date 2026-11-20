import { ScreenList } from "@/ui/screen-list";
import type { HostAttentionInbox, MobileInboxItem } from "@/domain/types";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useInboxSeen } from "../inbox/inbox-seen-store";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActionMenu, Body, Button, Notice, QueryState, Screen, ScreenHeader, SectionHeader, SegmentedControl, Sheet, StateView } from "@/ui/primitives";
import { CollectionToolbar } from "@/ui/search-field";
import { useCopy } from "@/ui/copy";
import { RECORD_ACCESS_UNAVAILABLE } from "@/ui/record-access-copy";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import { getLocales } from "expo-localization";
import { resolveLocale } from "@/localization";
import { Scope } from "./shared/scope";
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
  const [mode, setMode] = useState<"attention" | "providers">(view === "jira" || view === "issues" ? "providers" : "attention");
  return (
    <InboxBrowseMemoryProvider><Screen scroll={false} title={copy("Gelen kutusu", "Inbox")}>
      <ScreenHeader>
        <Button label={copy("Pull request’ler", "Pull requests")} tone="quiet" flush onPress={() => router.push("/pull-requests" as Href)} />
        <SegmentedControl
          hideLabel
          label={copy("Gelen kutusu", "Inbox")}
          value={mode}
          options={[
            { value: "attention", label: copy("Bekleyen işler", "Attention") },
            { value: "providers", label: copy("Issue ve PR", "Issues & PRs") },
          ]}
          onChange={setMode}
        />
      </ScreenHeader>
      {mode === "providers" ? <ProviderInboxScreen embedded openJira={view === "jira"} /> : <AttentionInboxScreen />}
    </Screen></InboxBrowseMemoryProvider>
  );
}
function AttentionInboxScreen() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const { projectId, setProjectId, matches } = useInboxLocalScope();
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
    { interval: 6000, enabled: scopeCurrent },
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
  const [help, setHelp] = useState<typeof lease | null>(null);
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
      header={partial ? <Notice tone="warning" retrying={query.isFetching}
        message={copy("Bazı projeler zamanında yanıt vermedi; onların bekleyen işleri burada görünmüyor olabilir.",
          "Some projects did not respond in time, so their attention items may be missing.")}
        onRetry={() => { void refresh(); }} /> : undefined}
      keyExtractor={(item) => item.id}
      context={<CollectionToolbar field={<Scope allowAll projectId={projectId} onChange={setProjectId} />} actions={readable ? (
        <ActionMenu label={copy("Diğer işlemler", "More actions")} busy={query.isFetching && data !== undefined}
          actions={[
            { key: "refresh", label: copy("Yenile", "Refresh"), disabled: query.isFetching,
              onPress: () => { void refresh(); } },
            data && !data.externalProviderInboxAvailable && { key: "help", label: copy("Yardım", "Help"),
              onPress: () => { if (lease.active && latest.current.readable && current()) setHelp(lease); } },
          ]} />
      ) : null} />}
      ListEmptyComponent={
        <>
          {!machine ? <StateView illustration="connect-computer" title={copy("Bir bilgisayar seçin", "Choose a computer")}
            action={{ label: copy("Bilgisayar bağla", "Connect a computer"), onPress: () => router.navigate("/machines") }} /> :!scopeCurrent || query.isEnabled === false && !query.error ? (
            <StateView illustration="unreachable" title={copy("Bağlantı bekleniyor", "Waiting for a connection")}
              description={copy(...RECORD_ACCESS_UNAVAILABLE)} />
          ) : <QueryState query={{...query, data: query.error ? undefined : data, refetch: refresh}} empty={data !== undefined && !partial}
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
              title={urgent ? copy("Şimdi sizden bekleyenler", "Needs you now") : copy("Diğer işler", "Other activity")}
              count={urgent ? groups.now.length : groups.earlier.length} /> : null}
            <AttentionRow item={item} time={relativeTime(item.updatedAt, copy)} onPress={() => open(item)} />
          </View>
        );
      }}
    />
    {help === lease && readable ? <Sheet visible title={copy("Yardım", "Help")} size="compact" onClose={() => setHelp(null)}>
      <Body muted>{copy(
        "GitHub, GitLab, Jira, Linear ve Azure için üstteki issue ve PR kutusunu açın.",
        "Open the issues and pull requests tab above for GitHub, GitLab, Jira, Linear and Azure.",
      )}</Body>
    </Sheet> : null}
  </>;
}
