import { ScreenList } from "@/ui/screen-list";
import type { HostAttentionInbox, MobileInboxItem } from "@/domain/types";
import { router } from "expo-router";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActionMenu, Body, QueryState, Screen, ScreenHeader, SectionHeader, SegmentedControl, Sheet, StateView } from "@/ui/primitives";
import { CollectionToolbar } from "@/ui/search-field";
import { useCopy } from "@/ui/copy";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import { getLocales } from "expo-localization";
import { resolveLocale } from "@/localization";
import { Scope } from "./shared/scope";
import { useInboxLocalScope } from "../inbox/inbox-local-scope";
import { AttentionRow } from "../inbox/attention-row";
import { groupAttention, isUrgentAttention } from "../inbox/attention-groups";
import { InboxBrowseMemoryProvider, useInboxBrowseMemory } from "../inbox/inbox-browse-memory-provider";
import { useInboxScrollMemory } from "../inbox/use-inbox-scroll-memory";
import { ProviderInboxScreen } from "../inbox/provider-inbox-screen";
import { View } from "react-native";
import { inboxRelativeTime } from "./inbox-time";
import { isInboxPrivateFailure } from "../inbox/provider-model";

const attentionRoutes = { task: "tasks", goal: "goals", automation: "automations", social: "social", "pull-request": "tasks", session: "inbox" } as const;

/** Mail-style relative time ("5 dk", "2 sa", "dün") in the app language. */
function relativeTime(value: number, copy: ReturnType<typeof useCopy>) {
  const language = useMachines.getState().language;
  const locale = language === "system" ? resolveLocale(getLocales().map((entry) => entry.languageTag)) : language;
  return inboxRelativeTime(value, locale, copy);
}

export function InboxScreen() {
  const copy = useCopy();
  const [mode, setMode] = useState<"attention" | "providers">("attention");
  return (
    <InboxBrowseMemoryProvider><Screen scroll={false} title={copy("Gelen kutusu", "Inbox")}>
      <ScreenHeader>
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
      {mode === "providers" ? <ProviderInboxScreen embedded /> : <AttentionInboxScreen />}
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
  const groups = useMemo(() => groupAttention(data?.items ?? []), [data]);
  const rows = groups.ordered;
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
        router.push({
          pathname: "/session/[id]",
          params: {
            id: item.sessionId,
            machineId: machine.id,
            ...(item.projectId ? { projectId: item.projectId } : {}),
          },
        });
    } else
      router.push(
        `/manage/${attentionRoutes[item.kind]}`,
      );
  };
  return <>
    <ScreenList<MobileInboxItem>
      {...scrollMemory.listProps}
      query={{...query, data, refetch: refresh}}
      refresh={refresh}
      data={rows}
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
      header={
        <>
          {!machine ? <StateView illustration="connect-computer" title={copy("Bir bilgisayar seçin", "Choose a computer")} /> : !scopeCurrent || query.isEnabled === false && !query.error ? (
            <StateView illustration="unreachable" title={copy("Bağlantı bekleniyor", "Waiting for a connection")}
              description={copy("Kayıt erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.",
              "Record access is unavailable. Check the original computer and project connection.")} />
          ) : <QueryState query={{...query, data, refetch: refresh}} empty={data?.items.length === 0}
            emptyIllustration="inbox-empty"
            emptyTitle={copy("Her şey yolunda", "You're all caught up")}
            emptyDetail={copy("Dikkat gerektiren bir şey olduğunda burada görünür.", "Anything that needs your attention will show up here.")} />}
        </>
      }
      renderItem={({ item, index }) => {
        const urgent = isUrgentAttention(item);
        const first = index === 0 || isUrgentAttention(rows[index - 1]!) !== urgent;
        return (
          <View>
            {first ? <SectionHeader
              title={urgent ? copy("Şimdi sizden bekleyenler", "Needs you now") : copy("Daha önce", "Earlier")}
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
