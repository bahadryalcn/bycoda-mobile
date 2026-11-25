import { useEffect, useRef, useState } from "react";
import { providerName } from "../workspace/provider-choices";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import { useHostQuery } from "@/state/queries";
import { hostKey } from "@/state/host-request";
import type { HostProject } from "@/domain/types";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { Body, Button, Disclosure, IconButton, Notice, QueryState, ScreenList, SectionHeader, SegmentedControl, StateView } from "@/ui/primitives";
import { MetricRow } from "@/ui/metric-row";
import { useCopy } from "@/ui/copy";
import { useInfoHint } from "@/ui/info-hint";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, space } from "@/ui/tokens";
import {
  readUsageReport,
  usageDuration,
  usageNumber,
  type SessionUsageReport,
} from "./usage-model";
import { compactTokens, providerUsage, shortSessionId, totalTokens } from "./usage-breakdown";
import { UsageCost } from "./usage-cost";
import { UsageLimits } from "./usage-limits";
import { ProviderShare, UsageKpis } from "./usage-charts";
import { UsageUnavailable, type UsageTab } from "./usage-summary";
import { toolLabels } from "./tool-labels";
import { ProjectPicker } from "../workspace/project-picker";

/**
 * Account limits and cost are computer-level and open without a project; only the Tokens tab reads
 * per-project sessions and asks for a project inside the tab.
 */
export function UsageScreen({ project }: { project?: HostProject }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const cache = useQueryClient();
  // Limits is what a phone user checks most; a deep link may ask for another tab.
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<UsageTab>(() => params.tab === "tokens" || params.tab === "cost" ? params.tab : "limits");
  const [choosingProject, setChoosingProject] = useState(false);
  const projectId = project?.id ?? null;
  const selectedKey = hostKey(machine?.id ?? null, [tab === "limits" ? "usage-limits" : tab === "cost" ? "usage-cost" : "session-usage"]);
  const selectedFetching = useIsFetching({ queryKey: selectedKey }) > 0;
  const selectedSupported = !!machine?.environmentId && !!machine.capabilities?.includes(tab === "limits" ? "usage.limits.read" : tab === "cost" ? "usage.cost.read" : "usage.sessions.read");
  const [days, setDays] = useState("1");
  const [untilMs, setUntilMs] = useState(Date.now);
  const [page, setPage] = useState<{ projectId: string | null; reviewed: ReviewedMachine | undefined; cursor?: string }>(() => ({ projectId, reviewed: reviewedMachine(machine) }));
  const pageIsCurrent = page.projectId === projectId && isReviewedMachine(page.reviewed, { activeId: machine?.id ?? null, machines: machine ? [machine] : [] });
  const cursor = pageIsCurrent ? page.cursor : undefined;
  const latestProject = useRef(projectId);
  latestProject.current = projectId;
  const [action, setAction] = useState<"refresh" | "first" | "next" | null>(null);
  const pending = useRef(false);
  const flight = useRef(0);
  const review = reviewedMachine(machine);
  const sinceMs = untilMs - Number(days) * 86400000;
  const sessionsSupported = !!machine?.capabilities?.includes("usage.sessions.read") && !!machine.environmentId;
  const supported = sessionsSupported && !!project;
  const query = useHostQuery<SessionUsageReport>(
    ["session-usage", projectId, sinceMs, untilMs, cursor],
    "usage.sessions.read",
    { projectId, sinceMs, untilMs, limit: 50, ...(cursor ? { cursor } : {}) },
    {
      enabled: supported,
      queryFn: async (client, signal) =>
        readUsageReport(
          await client.request(
            "usage.sessions.read",
            { projectId: project!.id, sinceMs, untilMs, limit: 50, ...(cursor ? { cursor } : {}) },
            { signal },
          ),
          { environmentId: machine!.environmentId!, projectId: project!.id, sinceMs, untilMs },
        ),
    },
  );
  const report = supported ? query.data : undefined;
  const hasTotals = report && (report.rows.length > 0 || Object.values(report.totals).some(value => value !== null && value !== 0));
  useEffect(() => {
    if (pageIsCurrent) return;
    flight.current += 1;
    pending.current = false;
    setAction(null);
    setPage({ projectId, reviewed: reviewedMachine(machine) });
  }, [pageIsCurrent, projectId, machine?.id, machine?.endpoint, machine?.environmentId, machine?.lanKey]);
  useEffect(() => {
    if (!query.isFetching) {
      pending.current = false;
      setAction(null);
    }
  }, [query.isFetching, untilMs, cursor]);
  const navigate = (next: "refresh" | "first" | "next", update: (flight: number) => void) => {
    if (pending.current || query.isFetching || !supported || latestProject.current !== projectId || !isReviewedMachine(review, useMachines.getState())) return;
    pending.current = true;
    setAction(next);
    update(++flight.current);
  };
  const setCursor = (value?: string) => setPage({ projectId, reviewed: review, cursor: value });
  const refresh = async () => {
    if (tab !== "tokens") {
      if (!selectedSupported || selectedFetching || latestProject.current !== projectId || !isReviewedMachine(review, useMachines.getState())) return;
      await cache.refetchQueries({ queryKey: selectedKey, type: "active" }, { cancelRefetch: false });
      return;
    }
    navigate("refresh", (request) => {
      const nextUntil = Date.now();
      setCursor(undefined);
      setUntilMs(nextUntil);
      // A same-millisecond refresh still reads once and releases its flight.
      if (!cursor && nextUntil === untilMs) void query.refetch().catch(() => {}).finally(() => {
        if (request === flight.current) { pending.current = false; setAction(null); }
      });
    });
  };
  const { colors } = useMobileTheme();
  const calcInfo = useInfoHint(copy(
    "Bu bilgisayarda gözlemlenen proje oturumları; başlangıcı bu aralıkta olan turlar sayılır. Hesap kotası ve fatura dahil değildir. Eksik değerler sıfır değildir.",
    "Project sessions observed on this computer; turns starting in this range are counted. Account quotas and bills are excluded. Missing values are not zero.",
  ), "inline");
  const refreshControl = (
    <IconButton
      label={copy("Yenile", "Refresh")}
      busy={tab === "tokens" ? action === "refresh" : selectedFetching}
      disabled={!selectedSupported || (tab === "tokens" ? query.isFetching : selectedFetching)}
      onPress={() => { void refresh(); }}
    >
      <RefreshCw size={iconSize.action} strokeWidth={2} color={colors.accent} />
    </IconButton>
  );
  return (
    <>
    {choosingProject ? (
      <ProjectPicker visible onClose={() => setChoosingProject(false)} onSelect={(selected) => {
        setChoosingProject(false);
        if (machine && useMachines.getState().activeId === machine.id)
          router.setParams({ projectId: selected.id, machineId: machine.id, tab: "tokens" });
      }} />
    ) : null}
    <ScreenList
      title={copy(...toolLabels.usage)}
      scope={{ computer: machine?.name, project: tab === "tokens" ? project?.name : undefined }}
      actions={refreshControl}
      refreshState={selectedSupported ? { refreshing: tab === "tokens" ? action === "refresh" : selectedFetching, onRefresh: refresh } : undefined}
      data={tab === "tokens" ? report?.rows ?? [] : []}
      keyExtractor={(row) => row.sessionId}
      header={
        <View style={{ gap: space.sm }}>
          <Stack.Screen options={{ title: copy(...toolLabels.usage) }} />
          <SegmentedControl
            hideLabel
            label={copy("Kullanım görünümü", "Usage view")}
            value={tab}
            options={[
              { value: "limits", label: copy("Limitler", "Limits") },
              { value: "cost", label: copy("Maliyet", "Cost") },
              { value: "tokens", label: copy("Token", "Tokens") },
            ]}
            onChange={setTab}
          />
          {tab === "cost" ? (machine?.capabilities?.includes("usage.cost.read") ? <UsageCost /> : <UsageUnavailable tab="cost" />) : null}
          {tab === "limits" ? (machine?.capabilities?.includes("usage.limits.read") ? <UsageLimits /> : <UsageUnavailable tab="limits" />) : null}
          {tab === "tokens" && !project ? (
            <StateView
              size="compact"
              title={copy("Token kullanımı proje başına gösterilir", "Token usage is shown per project")}
              action={sessionsSupported ? { label: copy("Proje seç", "Choose a project"), onPress: () => setChoosingProject(true) } : undefined}
            />
          ) : null}
          {tab === "tokens" && project ? <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <SegmentedControl
                hideLabel
                label={copy("Zaman aralığı", "Time range")}
                value={days}
                disabled={!supported || action !== null || query.isFetching}
                options={[
                  { value: "1", label: copy("24 saat", "24 hours") },
                  { value: "7", label: copy("7 gün", "7 days") },
                ]}
                onChange={(value) => {
                  if (value !== "1" && value !== "7" || pending.current || query.isFetching || !supported || latestProject.current !== projectId || !isReviewedMachine(review, useMachines.getState())) return;
                  setDays(value);
                  setCursor(undefined);
                }}
              />
            </View>
            <View style={{ minHeight: 48, justifyContent: "center" }}>{calcInfo.button}</View>
          </View>
          {calcInfo.panel}
          {!supported ? (
            <StateView
              size="compact"
              illustration="permission"
              title={copy("Güncelleme gerekiyor", "Update needed")}
              description={copy(
                "Oturum kullanımını görmek için bilgisayardaki bycoda’yı güncelle.",
                "Update bycoda on this computer to view session usage.",
              )}
            />
          ) : (
            <QueryState
              query={query}
              loading={action ? "none" : undefined}
              empty={query.isSuccess && !report?.rows.length}
              emptyTitle={copy(
                "Bu sayfada gözlemlenen tur yok.",
                "No observed turns on this page.",
              )}
              emptyDetail={report ? `${usageWindowDate(report.sampledAt)} · UTC` : undefined}
              emptyAction={cursor ? { label: copy("İlk sayfa", "First page"), onPress: () => navigate("first", () => setCursor(undefined)) } : undefined}
            />
          )}
          {report ? (
            <>
              {hasTotals ? <UsageKpis items={[
                { title: copy("Toplam token", "Total tokens"), value: compactTokens(totalTokens(report.totals)) },
                { title: copy("Tur", "Turns"), value: usageNumber(report.totals.turns) },
                { title: copy("Oturum", "Sessions"), value: usageNumber(report.rows.length) },
              ]} /> : null}
              {report.coverage.truncated || report.coverage.undatedTurns > 0 ? (
                <Notice
                  tone="warning"
                  message={copy(
                    "Kapsam kısmi; bu değerler tüm kullanımın toplamı değildir.",
                    "Coverage is partial; these values are not total usage.",
                  )}
                />
              ) : null}
              {hasTotals && providerUsage(report.rows).length ? (
                <View style={{ gap: space.sm }}>
                  <SectionHeader title={copy("Sağlayıcıya göre", "By provider")} />
                  <ProviderShare rows={providerUsage(report.rows)} />
                </View>
              ) : null}
              {hasTotals ? (
                <Disclosure label={copy("Token ayrıntısı", "Token details")}>
                  <UsageValues value={report.totals} />
                </Disclosure>
              ) : null}
            </>
          ) : null}
          </> : null}
          {tab === "tokens" && report?.rows.length ? <SectionHeader title={copy("Oturumlar", "Sessions")} count={report.rows.length} /> : null}
          {tab === "tokens" && ((!!cursor && (!query.isSuccess || !!report?.rows.length)) || action === "first") ? (
            <Button
              tone="quiet"
              label={copy("İlk sayfa", "First page")}
              busy={action === "first"}
              disabled={query.isFetching}
              onPress={() => navigate("first", () => setCursor(undefined))}
            />
          ) : null}
        </View>
      }
      renderItem={({ item }) => <SessionRow row={item} />}
      footer={
        tab === "tokens" && (report?.nextCursor || action === "next") ? (
          <Button
            tone="quiet"
            label={copy("Sonraki sayfa", "Next page")}
            busy={action === "next"}
            disabled={query.isFetching || query.isError}
            onPress={() => {
              if (!query.isError && report?.nextCursor) navigate("next", () => setCursor(report.nextCursor!));
            }}
          />
        ) : undefined
      }
    />
    </>
  );
}
function usageWindowDate(value: number) {
  return new Date(value).toLocaleString(undefined, {
    timeZone: "UTC", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
export function UsageValues({ value }: { value: SessionUsageReport["totals"] }) {
  const copy = useCopy();
  const fields: [string, string][] = [
    [copy("Gözlemlenen turlar", "Observed turns"), usageNumber(value.turns)],
    [copy("Ölçülen turlar", "Timed turns"), usageNumber(value.timedTurns)],
    [copy("Tur süresi", "Turn duration"), usageDuration(value.durationMs)],
    [copy("Giriş token’ları", "Input tokens"), usageNumber(value.inputTokens)],
    [copy("Çıkış token’ları", "Output tokens"), usageNumber(value.outputTokens)],
    [copy("Önbellekten okunan token’lar", "Cache read tokens"), usageNumber(value.cacheReadTokens)],
    [
      copy("Önbelleğe yazılan token’lar", "Cache write tokens"),
      usageNumber(value.cacheWriteTokens),
    ],
  ];
  return (
    <View style={{ gap: space.xs }}>
      {fields.map(([label, reading]) => (
        <MetricRow key={label} label={label} value={reading} />
      ))}
    </View>
  );
}

/** One observed session: provider as the title, the shortened id beside it, and the reading on the right. */
function SessionRow({ row }: { row: SessionUsageReport["rows"][number] }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const tokens = totalTokens(row);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.separator }}>
      <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
        <Body style={{ fontWeight: "600" }}>{providerName(row.provider)}</Body>
        <Body muted mono>{`${copy("Oturum", "Session")} ${shortSessionId(row.sessionId)}`}</Body>
      </View>
      <View style={{ alignItems: "flex-end", minWidth: 0, gap: space.xs }}>
        <Body mono>{tokens === null ? "—" : `${compactTokens(tokens)} ${copy("token", "tokens")}`}</Body>
        <Body muted>{`${usageNumber(row.turns)} ${copy("tur", "turns")} · ${usageDuration(row.durationMs)}`}</Body>
      </View>
    </View>
  );
}
