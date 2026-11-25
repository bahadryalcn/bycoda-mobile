import { ProviderAccountKind } from "@/ui/provider-account-kind";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Badge } from "panelui-native/components/badge";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { Body, Button, Card, QueryState, SectionHeader, StatusRow, StatusText } from "@/ui/primitives";
import { MetricValue } from "@/ui/metric-value";
import { MetricRow } from "@/ui/metric-row";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { useMobileTheme } from "@/ui/theme";
import { useCopy } from "@/ui/copy";
import { useInfoHint } from "@/ui/info-hint";
import { useLocale } from "@/i18n";
import { radii, space } from "@/ui/tokens";
import { AccountMeter, RemainingMeter } from "@/ui/usage-meters";
import {
  latestQuotaObservation,
  presentLimitsReport,
  quotaFailure,
  readLimitsReport,
  resetCountdown,
  wholePercent,
  type UsageLimitsReport,
} from "./usage-limits-model";

type Card_ = UsageLimitsReport["providers"][number]["cards"][number];
const PROVIDER_NAMES = { claude: "Claude", codex: "Codex", opencode: "OpenCode", grok: "Grok" } as const;

/** Wall clock that ticks each minute so reset countdowns stay current. */
function useMinuteNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Short wall time without seconds; the date only when it is not today. */
export function shortTime(at: number, now: number, locale: string): string {
  const date = new Date(at);
  const sameDay = date.toDateString() === new Date(now).toDateString();
  return date.toLocaleString(locale, sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Provider quota windows from the Host: one card per window, one row per account. */
export function UsageLimits() {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  const locale = useLocale();
  const machine = useActiveMachine();
  const now = useMinuteNow();
  const info = useInfoHint(copy(
    "Yüzdeler hesaplar ve pencereler arasında toplanmaz.",
    "Percentages are per account and window; they are not pooled.",
  ));
  const supported =
    !!machine?.capabilities?.includes("usage.limits.read") && !!machine.environmentId;
  const query = useHostQuery<UsageLimitsReport>(
    ["usage-limits"],
    "usage.limits.read",
    {},
    {
      enabled: supported,
      interval: 120_000,
      queryFn: async (client, signal) =>
        readLimitsReport(
          await client.request("usage.limits.read", {}, { signal }),
          machine!.environmentId!,
        ),
    },
  );
  const defaultLabel = copy("Varsayılan hesap", "Default account");
  const report = useMemo(() => query.data ? presentLimitsReport(query.data, defaultLabel) : undefined, [query.data, defaultLabel]);
  const providers = report?.providers ?? [];
  const observedAt = report ? latestQuotaObservation(report) : null;
  const hasCards = providers.some((provider) => provider.cards.length > 0);
  const refetch = query.refetch;
  // Only a press of Retry shows its own progress; the page refresh and polling stay quiet here.
  const retry = usePullRefresh(() => refetch());
  const failureText = (account: { status: "ok" | "unavailable" | "error"; error: string | null }) => {
    switch (quotaFailure(account)) {
      case "renewal": return copy("bu hesap yeniden kullanılınca güncellenir", "updates when this account is used again");
      case "signedOut": return copy("oturum açılmamış", "not signed in");
      case "rateLimited": return copy("sağlayıcı okumayı sınırladı; sonra yeniden denenecek", "the provider is limiting reads; it will retry later");
      case "unavailable": return copy("kullanılamıyor", "unavailable");
      default: return copy("okunamadı", "could not be read");
    }
  };
  const units = { day: copy("gün", "d"), hour: copy("sa", "h"), minute: copy("dk", "min") };
  const title = (card: Card_) => {
    const base =
      card.kind === "session"
        ? copy("5 saat", "5-hour")
        : card.kind === "weekly"
          ? copy("Haftalık", "Weekly")
          : copy("Aylık", "Monthly");
    return card.model ? `${base} · ${card.model}` : base;
  };
  const paceText = (pace: Card_["best"]["pace"]) =>
    pace === "ahead"
      ? copy("Beklenenden fazla kullanım", "Ahead of pace")
      : pace === "behind"
        ? copy("Beklenenden az kullanım", "Behind pace")
        : pace === "on"
          ? copy("Beklenen düzeyde", "On pace")
          : null;
  // Lead with the relative reset; the absolute time follows as secondary text.
  const resetLine = (reading: Card_["best"]) => {
    const left = resetCountdown(reading.resetsAt, now, locale, units);
    return left
      ? copy("+%{p0} · {p1} içinde", "+{p0}% in {p1}", {
          p0: wholePercent(reading.regainPercent),
          p1: left,
        })
      : reading.resetsAt === null ? copy("Sıfırlanma zamanı bilinmiyor", "Reset time unknown") : null;
  };
  return (
    <View style={{ gap: space.md }}>
      {report ? <View style={{ gap: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          {observedAt !== null ? <Body muted style={{ flexShrink: 1 }}>
            {copy("Son ölçüm {p0}", "Last reading {p0}", { p0: shortTime(observedAt, now, locale) })}
          </Body> : null}
          {info.button}
        </View>
        {info.panel}
      </View> : null}
      <QueryState
        query={query}
        empty={
          query.isSuccess &&
          !hasCards &&
          !providers.some((provider) => provider.accounts.length > 0)
        }
        emptyTitle={copy("Henüz limit verisi yok", "No limit data yet")}
        emptyAction={refetch ? { label: copy("Yenile", "Refresh"), onPress: () => void refetch() } : undefined}
      />
      {providers.map((provider) => {
        // The same single account in every window is named once beside the provider.
        const firstAccount = provider.cards[0]?.accounts[0];
        const onlyAccount = firstAccount && provider.cards.every((card) =>
          card.accounts.length === 1 && card.accounts[0]!.id === firstAccount.id) ? firstAccount : null;
        const failed = provider.accounts.filter((account) => account.status !== "ok");
        const credited = provider.accounts.filter((account) => (account.resetCredits ?? 0) > 0);
        return (
        <View key={provider.provider} style={{ gap: space.sm }}>
          <SectionHeader title={PROVIDER_NAMES[provider.provider]} trailing={onlyAccount ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1, maxWidth: "60%" }}>
              <ProviderAccountKind kind={onlyAccount.kind} />
              <Body muted numberOfLines={2} style={{ flexShrink: 1 }}>{onlyAccount.label}</Body>
            </View>
          ) : undefined} />
          {credited.length === 1 && onlyAccount ? (
            <MetricRow label={copy("Sıfırlama hakkı", "Reset credits")} value={credited[0]!.resetCredits!.toLocaleString(locale)} />
          ) : credited.length > 0 ? (
            // One caption names the measure; each account then reads as name and count.
            <View style={{ gap: space.xs }}>
              <Body muted style={uiStyles.caption}>{copy("Sıfırlama hakkı", "Reset credits")}</Body>
              {credited.map((account) => (
                <MetricRow key={account.id} label={account.label} value={account.resetCredits!.toLocaleString(locale)} />
              ))}
            </View>
          ) : null}
          {provider.cards.map((card) => {
            const left = wholePercent(card.best.leftPercent);
            return (
            <Card key={card.key} variant="surface">
              <View
                style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", columnGap: space.sm, rowGap: space.xs }}
              >
                <Body style={{ fontWeight: "600", flexShrink: 1 }}>{title(card)}</Body>
                {paceText(card.best.pace) ? <Body muted>{paceText(card.best.pace)}</Body> : null}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: space.xs }}>
                <MetricValue>{`${left}%`}</MetricValue>
                {left === 0
                  ? <StatusText tone="danger" dot={false} label={copy("Tükendi", "Used up")} />
                  : <Body muted>{copy("kaldı", "left")}</Body>}
              </View>
              {resetLine(card.best) ? <Body muted>{resetLine(card.best)}</Body> : null}
              {card.best.resetsAt !== null ? <Body muted style={uiStyles.caption}>{copy("Sıfırlanma: {p0}", "Resets at {p0}", { p0: shortTime(card.best.resetsAt, now, locale) })}</Body> : null}
              <RemainingMeter
                left={card.best.leftPercent}
                timeLeft={card.best.timeLeftPercent}
                label={`${title(card)} ${copy("kaldı", "left")}`}
              />
              {card.accounts.length === 1 ? (onlyAccount ? null : (
                // One account repeats the headline reading above; show only whose it is.
                <StatusRow label={card.accounts[0]!.label}>
                  <ProviderAccountKind kind={card.accounts[0]!.kind} />
                </StatusRow>
              )) : (
              <View style={{ gap: space.sm, marginTop: space.xs }}>
                {card.accounts.map((account) => {
                  const countdown = resetCountdown(account.reading.resetsAt, now, locale, units);
                  return (
                    <View key={account.id} style={{ gap: space.xs }}>
                      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
                        <Badge
                          shape="dot"
                          accessible={false}
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: radii.pill,
                            backgroundColor: account.color,
                          }}
                        />
                        <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
                          {/* Name and headroom lead; kind and reset sit on a quieter second line. */}
                          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: space.sm, rowGap: space.xs }}>
                            <Body style={{ flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0 }}>{account.label}</Body>
                            <Body mono style={{ marginStart: "auto" }}>{`${wholePercent(account.reading.leftPercent)}% ${copy("kaldı", "left")}`}</Body>
                          </View>
                          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.sm, rowGap: space.xs }}>
                            <ProviderAccountKind kind={account.kind} />
                            {countdown || account.reading.resetsAt === null ? <Body muted style={[uiStyles.caption, { flexShrink: 1 }]}>
                              {countdown
                                ? copy("{p0} içinde sıfırlanır", "Resets in {p0}", { p0: countdown })
                                : copy("Sıfırlanma zamanı bilinmiyor", "Reset time unknown")}
                            </Body> : null}
                          </View>
                        </View>
                      </View>
                      <AccountMeter
                        left={account.reading.leftPercent}
                        label={`${account.label} ${copy("kaldı", "left")}`}
                      />
                    </View>
                  );
                })}
              </View>
              )}
            </Card>
            );
          })}
          {failed.map((account) => (
            <View key={account.id} style={{ gap: space.xs }}>
              <StatusText tone="warning" label={`${account.label}: ${failureText(account)}`} />
              {account.observedAt != null ? <Body muted style={uiStyles.caption}>
                {copy("Gösterilen değerler {p0} ölçümünden", "Showing the reading from {p0}", { p0: shortTime(account.observedAt, now, locale) })}
              </Body> : null}
            </View>
          ))}
          {failed.length > 0 ? (
            <Button tone="quiet" density="compact" label={copy("Yeniden dene", "Retry")} busy={retry.refreshing}
              disabled={query.isFetching === true} onPress={() => void retry.onRefresh()} style={{ alignSelf: "flex-start" }} />
          ) : null}
        </View>
        );
      })}
    </View>
  );
}
