import { useState } from "react";
import { View } from "react-native";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import type { HostProject } from "@/domain/types";
import {
  Body,
  Button,
  Card,
  Notice,
  QueryState,
  Row,
  ScreenList,
  SelectField,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
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
  return (
    <ScreenList
      title={copy("Oturum kullanımı", "Session usage")}
      subtitle={`${machine?.name ?? ""} · ${project.name}`}
      data={report?.rows ?? []}
      keyExtractor={(row) => row.sessionId}
      header={
        <View style={{ gap: space.sm }}>
          <Notice
            message={copy(
              "Yalnız bu bilgisayardaki host’un gözlemlediği oturumlar. Hesap kotası, abonelik faturası ve token bütçesi dahil değildir.",
              "Only sessions observed by this computer's host. Account quotas, subscription bills and token budgets are excluded.",
            )}
          />
          <SelectField
            label={copy("Zaman aralığı", "Time range")}
            value={days}
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
            {new Date(sinceMs).toISOString()} — {new Date(untilMs).toISOString()} · UTC
          </Body>
          <Body muted>
            {copy(
              "Başlangıcı bu aralıkta olan turlar sayılır. Süre, tamamlanan turun tüm süresidir; token verisi sağlayıcı bildirirse görünür. Eksik değerler sıfır değildir.",
              "Counts turns starting in this interval. Duration covers the entire settled turn; tokens appear when reported by the provider. Missing values are not zero.",
            )}
          </Body>
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
              empty={query.isSuccess && !report?.rows.length}
              emptyTitle={copy(
                "Bu sayfada gözlemlenen tur yok.",
                "No observed turns on this page.",
              )}
            />
          )}
          <Button
            tone="quiet"
            label={copy("Yenile", "Refresh")}
            disabled={!supported || query.isFetching}
            onPress={() => {
              setCursor(undefined);
              setUntilMs(Date.now());
            }}
          />
          {report ? (
            <>
              <Body muted>
                {copy("Bu sayfanın gözlemlenen toplamları", "Observed totals on this page")} ·{" "}
                {new Date(report.sampledAt).toISOString()}
              </Body>
              {report.coverage.truncated || report.coverage.undatedTurns > 0 ? (
                <Notice
                  tone="warning"
                  message={copy(
                    "Kapsam kısmi: sayfa veya tarama sınırı ya da tarihsiz turlar var. Bu değerler tüm kullanımın toplamı değildir.",
                    "Coverage is partial: page or scan limits, or undated turns are present. These values are not total usage.",
                  )}
                />
              ) : null}
              <UsageValues value={report.totals} />
              {cursor ? (
                <Button
                  tone="quiet"
                  label={copy("İlk sayfa", "First page")}
                  onPress={() => setCursor(undefined)}
                />
              ) : null}
            </>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <Card>
          <Body mono>{item.sessionId}</Body>
          <Body muted>
            {copy("Sağlayıcı", "Provider")}: {item.provider}
          </Body>
          <UsageValues value={item} />
        </Card>
      )}
      footer={
        report?.nextCursor ? (
          <Button
            tone="quiet"
            label={copy("Sonraki sayfa", "Next page")}
            disabled={query.isFetching}
            onPress={() => setCursor(report.nextCursor!)}
          />
        ) : undefined
      }
    />
  );
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
          <Body>{label}</Body>
          <Body mono>{reading}</Body>
        </Row>
      ))}
    </View>
  );
}
