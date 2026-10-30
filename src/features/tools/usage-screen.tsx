import { useEffect, useRef, useState } from "react";
import { Stack } from "expo-router";
import { View } from "react-native";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import type { HostProject } from "@/domain/types";
import { Body, Button, Disclosure, Notice, QueryState, Row, ScreenList, SelectField } from "@/ui/primitives";
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
  const [cursor, setCursor] = useState<string | undefined>();
  const [action, setAction] = useState<"refresh" | "first" | "next" | null>(null);
  const pending = useRef(false);
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
  useEffect(() => {
    if (!query.isFetching) {
      pending.current = false;
      setAction(null);
    }
  }, [query.isFetching, untilMs, cursor]);
  const navigate = (next: "refresh" | "first" | "next", update: () => void) => {
    if (pending.current || query.isFetching || !supported) return;
    pending.current = true;
    setAction(next);
    update();
  };
  const refreshControl = (
    <Button
      tone="quiet"
      label={copy("Yenile", "Refresh")}
      busy={action === "refresh"}
      disabled={!supported || query.isFetching}
      onPress={() => navigate("refresh", () => {
        setCursor(undefined);
        setUntilMs(Date.now());
      })}
    />
  );
  return (
    <ScreenList
      title={copy("Oturum kullanımı", "Session usage")}
      subtitle={`${machine?.name ?? ""} · ${project.name}`}
      data={report?.rows ?? []}
      keyExtractor={(row) => row.sessionId}
      header={
        <View style={{ gap: space.sm }}>
          <Stack.Screen options={{ title: copy("Oturum kullanımı", "Session usage"), headerRight: () => refreshControl }} />
          <SelectField
            label={copy("Zaman aralığı", "Time range")}
            value={days}
            disabled={action !== null}
            options={[
              { value: "1", label: copy("Son 24 saat", "Last 24 hours") },
              { value: "7", label: copy("Son 7 gün", "Last 7 days") },
            ]}
            onChange={(value) => {
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
              <RecordCard title={copy("Bu sayfanın gözlemlenen toplamları", "Observed totals on this page")}
                metadata={`${usageWindowDate(report.sampledAt)} · UTC`}
                preview={<Row><Body muted>{copy("Gözlemlenen turlar", "Observed turns")}: {usageNumber(report.totals.turns)}</Body><Body mono>{usageDuration(report.totals.durationMs)}</Body></Row>}
                details={<UsageValues value={report.totals} />} />
            </>
          ) : null}
          {cursor || action === "first" ? (
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
          preview={<Row><Body muted>{copy("Gözlemlenen turlar", "Observed turns")}: {usageNumber(item.turns)}</Body><Body mono>{usageDuration(item.durationMs)}</Body></Row>}
          details={<UsageValues value={item} />}
        />
      )}
      footer={
        report?.nextCursor || action === "next" ? (
          <Button
            tone="quiet"
            label={copy("Sonraki sayfa", "Next page")}
            busy={action === "next"}
            disabled={query.isFetching}
            onPress={() => {
              if (report?.nextCursor) navigate("next", () => setCursor(report.nextCursor!));
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
  const fields = [
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
        <Row key={label}>
          <Body style={{ flex: 1 }}>{label}</Body>
          <Body mono>{reading}</Body>
        </Row>
      ))}
    </View>
  );
}
