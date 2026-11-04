import { useEffect, useRef, useState } from "react";
import { Stack } from "expo-router";
import { View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import { useHostQuery } from "@/state/queries";
import type { HostProject } from "@/domain/types";
import { Body, Button, Disclosure, Notice, QueryState, ScreenList, SelectField } from "@/ui/primitives";
import { MetricRow } from "@/ui/metric-row";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { RecordCard } from "@/ui/record-card";
import {
  readUsageReport,
  usageDuration,
  usageNumber,
  type SessionUsageReport,
} from "./usage-model";

export function UsageScreen({ project }: { project: HostProject }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [days, setDays] = useState("1");
  const [untilMs, setUntilMs] = useState(Date.now);
  const [page, setPage] = useState<{ projectId: string; reviewed: ReviewedMachine | undefined; cursor?: string }>(() => ({ projectId: project.id, reviewed: reviewedMachine(machine) }));
  const pageIsCurrent = page.projectId === project.id && isReviewedMachine(page.reviewed, { activeId: machine?.id ?? null, machines: machine ? [machine] : [] });
  const cursor = pageIsCurrent ? page.cursor : undefined;
  const latestProject = useRef(project.id);
  latestProject.current = project.id;
  const [action, setAction] = useState<"refresh" | "first" | "next" | null>(null);
  const pending = useRef(false);
  const flight = useRef(0);
  const review = reviewedMachine(machine);
  const sinceMs = untilMs - Number(days) * 86400000;
  const supported =
    machine?.capabilities?.includes("usage.sessions.read") && !!machine.environmentId;
  const query = useHostQuery<SessionUsageReport>(
    ["session-usage", project.id, sinceMs, untilMs, cursor],
    "usage.sessions.read",
    { projectId: project.id, sinceMs, untilMs, limit: 50, ...(cursor ? { cursor } : {}) },
    {
      enabled: !!supported,
      queryFn: async (client, signal) =>
        readUsageReport(
          await client.request(
            "usage.sessions.read",
            { projectId: project.id, sinceMs, untilMs, limit: 50, ...(cursor ? { cursor } : {}) },
            { signal },
          ),
          { environmentId: machine!.environmentId!, projectId: project.id, sinceMs, untilMs },
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
    setPage({ projectId: project.id, reviewed: reviewedMachine(machine) });
  }, [pageIsCurrent, project.id, machine?.id, machine?.endpoint, machine?.environmentId, machine?.lanKey]);
  useEffect(() => {
    if (!query.isFetching) {
      pending.current = false;
      setAction(null);
    }
  }, [query.isFetching, untilMs, cursor]);
  const navigate = (next: "refresh" | "first" | "next", update: (flight: number) => void) => {
    if (pending.current || query.isFetching || !supported || latestProject.current !== project.id || !isReviewedMachine(review, useMachines.getState())) return;
    pending.current = true;
    setAction(next);
    update(++flight.current);
  };
  const setCursor = (value?: string) => setPage({ projectId: project.id, reviewed: review, cursor: value });
  const refresh = async () => navigate("refresh", (request) => {
    const nextUntil = Date.now();
    setCursor(undefined);
    setUntilMs(nextUntil);
    // A same-millisecond refresh still reads once and releases its flight.
    if (!cursor && nextUntil === untilMs) void query.refetch().catch(() => {}).finally(() => {
      if (request === flight.current) { pending.current = false; setAction(null); }
    });
  });
  const refreshControl = (
    <Button
      tone="quiet"
      label={copy("Yenile", "Refresh")}
      busy={action === "refresh"}
      disabled={!supported || query.isFetching}
      onPress={() => { void refresh(); }}
    />
  );
  return (
    <ScreenList
      title={copy("Oturum kullanımı", "Session usage")}
      subtitle={`${machine?.name ?? ""} · ${project.name}`}
      actions={refreshControl}
      refreshState={supported ? { refreshing: action === "refresh", onRefresh: refresh } : undefined}
      data={report?.rows ?? []}
      keyExtractor={(row) => row.sessionId}
      header={
        <View style={{ gap: space.sm }}>
          <Stack.Screen options={{ title: copy("Oturum kullanımı", "Session usage") }} />
          <SelectField
            label={copy("Zaman aralığı", "Time range")}
            value={days}
            disabled={!supported || action !== null || query.isFetching}
            options={[
              { value: "1", label: copy("Son 24 saat", "Last 24 hours") },
              { value: "7", label: copy("Son 7 gün", "Last 7 days") },
            ]}
            onChange={(value) => {
              if (value !== "1" && value !== "7" || pending.current || query.isFetching || !supported || latestProject.current !== project.id || !isReviewedMachine(review, useMachines.getState())) return;
              setDays(value);
              setCursor(undefined);
            }}
          />
          <Body muted>
            {usageWindowDate(sinceMs)} — {usageWindowDate(untilMs)} · UTC
          </Body>
          <Disclosure label={copy("Nasıl hesaplanır?", "How is usage calculated?")}>
            <Body muted>{copy("Bu bilgisayarda gözlemlenen proje oturumları.", "Project sessions observed on this computer.")}</Body>
            <Body muted>{copy(
              "Hesap kotası, abonelik faturası ve token bütçesi dahil değildir.",
              "Account quotas, subscription bills and token budgets are excluded.",
            )}</Body>
            <Body muted>
            {copy(
              "Başlangıcı bu aralıkta olan turlar sayılır. Süre, tamamlanan turun tüm süresidir; token verisi sağlayıcı bildirirse görünür. Eksik değerler sıfır değildir.",
              "Counts turns starting in this interval. Duration covers the entire settled turn; tokens appear when reported by the provider. Missing values are not zero.",
            )}
            </Body>
            <Body muted>{new Date(sinceMs).toISOString()} — {new Date(untilMs).toISOString()} · UTC</Body>
          </Disclosure>
          {!supported ? (
            <Notice
              message={copy(
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
              {report.coverage.truncated || report.coverage.undatedTurns > 0 ? (
                <Notice
                  tone="warning"
                  message={copy(
                    "Kapsam kısmi: sayfa veya tarama sınırı ya da tarihsiz turlar var. Bu değerler tüm kullanımın toplamı değildir.",
                    "Coverage is partial: page or scan limits, or undated turns are present. These values are not total usage.",
                  )}
                />
              ) : null}
              {hasTotals ? <RecordCard title={copy("Bu sayfanın gözlemlenen toplamları", "Observed totals on this page")}
                metadata={`${usageWindowDate(report.sampledAt)} · UTC`}
                preview={<MetricRow label={`${copy("Gözlemlenen turlar", "Observed turns")}: ${usageNumber(report.totals.turns)}`} value={usageDuration(report.totals.durationMs)} />}
                details={<UsageValues value={report.totals} />} /> : null}
            </>
          ) : null}
          {(!!cursor && (!query.isSuccess || !!report?.rows.length)) || action === "first" ? (
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
      renderItem={({ item }) => (
        <RecordCard
          title={item.provider}
          metadata={item.sessionId}
          preview={<MetricRow label={`${copy("Gözlemlenen turlar", "Observed turns")}: ${usageNumber(item.turns)}`} value={usageDuration(item.durationMs)} />}
          details={<UsageValues value={item} />}
        />
      )}
      footer={
        report?.nextCursor || action === "next" ? (
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
    [copy("Maliyet", "Cost"), "—"],
  ];
  return (
    <View style={{ gap: space.xs }}>
      {fields.map(([label, reading]) => (
        <MetricRow key={label} label={label} value={reading} />
      ))}
    </View>
  );
}
