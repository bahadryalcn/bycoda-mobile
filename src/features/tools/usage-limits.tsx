import { ProviderAccountKind } from "@/ui/provider-account-kind";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge } from "panelui-native/components/badge";
import RotateCcw from "lucide-react-native/icons/rotate-ccw";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { Body, IconButton, QueryState, SectionHeader, StatusText } from "@/ui/primitives";
import { MetricValue } from "@/ui/metric-value";
import { Hint } from "@/ui/hint";
import { useMobileTheme } from "@/ui/theme";
import { useCopy } from "@/ui/copy";
import { useOwnerVisible } from "@/ui/use-owner-visible";
import { useLocale } from "@/i18n";
import { space } from "@/ui/tokens";
import { NamedMeter, RemainingMeter } from "@/ui/usage-meters";
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
type Account_ = Card_["accounts"][number];
const PROVIDER_NAMES = { claude: "Claude", codex: "Codex", opencode: "OpenCode", grok: "Grok" } as const;

/** Wall clock that ticks each minute so reset countdowns stay current. */
function useMinuteNow() {
  const [now, setNow] = useState(Date.now);
  // Ticks only while the screen is seen; catching up on return keeps countdowns exact.
  const visible = useOwnerVisible();
  useEffect(() => {
    if (!visible) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [visible]);
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

/** The Host quota report as presented (Host profile named or folded into its duplicate); one shared read. */
export function useUsageLimitsReport() {
  const copy = useCopy();
  const machine = useActiveMachine();
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
  return { query, report };
}

/**
 * Quiet header status for Limits: when the readings were taken and, only when an account could not
 * be reread, a warning glyph whose tap explains which and why. The header refresh is the retry.
 */
export function UsageLimitsStatus() {
  const copy = useCopy();
  const locale = useLocale();
  const now = useMinuteNow();
  const { semanticColors, uiStyles } = useMobileTheme();
  const { report } = useUsageLimitsReport();
  if (!report) return null;
  const observedAt = latestQuotaObservation(report);
  const reason = (account: { status: "ok" | "unavailable" | "error"; error: string | null }) => {
    switch (quotaFailure(account)) {
      case "renewal": return copy("bu hesap yeniden kullanılınca güncellenir", "updates when this account is used again");
      case "signedOut": return copy("oturum açılmamış", "not signed in");
      case "rateLimited": return copy("sağlayıcı okumayı sınırladı; sonra yeniden denenecek", "the provider is limiting reads; it will retry later");
      case "unavailable": return copy("kullanılamıyor", "unavailable");
      default: return copy("okunamadı", "could not be read");
    }
  };
  const warnings = report.providers.flatMap((provider) => provider.accounts
    .filter((account) => account.status !== "ok")
    .map((account) => {
      const stale = account.observedAt != null
        ? ` ${copy("Gösterilen değerler {p0} ölçümünden", "Showing the reading from {p0}", { p0: shortTime(account.observedAt, now, locale) })}.`
        : "";
      return `${PROVIDER_NAMES[provider.provider]} · ${account.label}: ${reason(account)}.${stale}`;
    }));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1 }}>
      {observedAt !== null ? (
        <Body muted numberOfLines={1} style={[uiStyles.caption, { flexShrink: 1 }]}>
          {copy("Güncellendi {p0}", "Updated {p0}", { p0: shortTime(observedAt, now, locale) })}
        </Body>
      ) : null}
      {/* The tooltip trigger owns the tap and opens the explanation; the header refresh retries. */}
      {warnings.length ? (
        <Hint label={warnings.join("\n")} openOn="press">
          <IconButton label={`${copy("Uyarı", "Warning")}: ${warnings.join(" ")}`} onPress={() => undefined}>
            <TriangleAlert size={18} strokeWidth={2} color={semanticColors.warning.text} />
          </IconButton>
        </Hint>
      ) : null}
    </View>
  );
}

/** Provider quota windows from the Host: one section per provider, one block per window. */
export function UsageLimits() {
  const copy = useCopy();
  const { colors, uiStyles } = useMobileTheme();
  const locale = useLocale();
  const now = useMinuteNow();
  const { query, report } = useUsageLimitsReport();
  const providers = report?.providers ?? [];
  const hasCards = providers.some((provider) => provider.cards.length > 0);
  const refetch = query.refetch;
  const units = { day: copy("gün", "d"), hour: copy("sa", "h"), minute: copy("dk", "min") };
  const kindLabel = (kind: Account_["kind"]) => kind === "work" ? copy("İş", "Work") : copy("Kişisel", "Personal");
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
  // One caption: what comes back and when, then the absolute reset time.
  const resetLine = (reading: Card_["best"]) => {
    const left = resetCountdown(reading.resetsAt, now, locale, units);
    if (!left) return reading.resetsAt === null ? copy("Sıfırlanma zamanı bilinmiyor", "Reset time unknown") : copy("Sıfırlanma: {p0}", "Resets at {p0}", { p0: shortTime(reading.resetsAt, now, locale) });
    return `${copy("+%{p0} · {p1} içinde", "+{p0}% in {p1}", { p0: wholePercent(reading.regainPercent), p1: left })} · ${shortTime(reading.resetsAt!, now, locale)}`;
  };
  // Whose bar: the name inside the bar, the kind as a glyph when the provider mixes accounts.
  const namedMeter = (account: Account_, showKind: boolean, timeLeft: number | null, cardTitle: string) => {
    const countdown = resetCountdown(account.reading.resetsAt, now, locale, units);
    const spoken = [
      account.label,
      showKind ? kindLabel(account.kind) : null,
      cardTitle,
      `${wholePercent(account.reading.leftPercent)}% ${copy("kaldı", "left")}`,
      countdown ? copy("{p0} içinde sıfırlanır", "Resets in {p0}", { p0: countdown }) : null,
    ].filter(Boolean).join(", ");
    return (
      <NamedMeter
        left={account.reading.leftPercent}
        timeLeft={timeLeft}
        name={account.label}
        label={spoken}
        glyph={showKind ? (ink) => <ProviderAccountKind kind={account.kind} iconOnly color={ink} /> : undefined}
      />
    );
  };
  return (
    <View style={{ gap: space.md }}>
      <QueryState
        query={query}
        empty={
          query.isSuccess &&
          !hasCards &&
          !providers.some((provider) => provider.accounts.length > 0)
        }
        emptyTitle={copy("Henüz limit verisi yok", "No limit data yet")}
        emptyAction={{ label: copy("Yenile", "Refresh"), onPress: () => void refetch() }}
      />
      {providers.map((provider) => {
        // One account everywhere: no names or kinds at all, the provider says whose it is.
        const firstAccount = provider.cards[0]?.accounts[0];
        const single = provider.accounts.length <= 1 || (!!firstAccount && provider.cards.every((card) =>
          card.accounts.length === 1 && card.accounts[0]!.id === firstAccount.id));
        const mixedKinds = new Set(provider.accounts.map((account) => account.kind ?? "personal")).size > 1;
        const credited = provider.accounts.filter((account) => (account.resetCredits ?? 0) > 0);
        return (
        <View key={provider.provider} style={{ gap: space.sm }}>
          <SectionHeader title={PROVIDER_NAMES[provider.provider]} trailing={credited.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: space.xs }}>
              {credited.map((account) => {
                const count = account.resetCredits!.toLocaleString(locale);
                return (
                  <Badge
                    key={account.id}
                    variant="secondary"
                    size="sm"
                    accessible
                    accessibilityLabel={single
                      ? copy("Sıfırlama hakkı: {p0}", "Reset credits: {p0}", { p0: count })
                      : `${account.label}, ${copy("Sıfırlama hakkı: {p0}", "Reset credits: {p0}", { p0: count })}`}
                  >
                    <RotateCcw size={12} strokeWidth={2.2} color={colors.muted} />
                    {single ? count : `${account.label} ${count}`}
                  </Badge>
                );
              })}
            </View>
          ) : undefined} />
          {provider.cards.map((card, index) => {
            const left = wholePercent(card.best.leftPercent);
            const reset = resetLine(card.best);
            const pace = paceText(card.best.pace);
            const lone = card.accounts.length === 1 ? card.accounts[0]! : null;
            return (
            <View
              key={card.key}
              style={[
                { gap: space.sm },
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, paddingTop: space.md },
              ]}
            >
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", columnGap: space.sm, rowGap: space.xs }}>
                <Body style={{ fontWeight: "600", flexShrink: 1 }}>{title(card)}</Body>
                {pace ? <Body muted style={uiStyles.caption}>{pace}</Body> : null}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: space.xs }}>
                <MetricValue>{`${left}%`}</MetricValue>
                {left === 0
                  ? <StatusText tone="danger" dot={false} label={copy("Tükendi", "Used up")} />
                  : <Body muted>{copy("kaldı", "left")}</Body>}
              </View>
              {reset ? <Body muted style={uiStyles.caption}>{reset}</Body> : null}
              {lone && !single
                // One account in a mixed provider: its name rides in the headline bar.
                ? namedMeter(lone, mixedKinds, card.best.timeLeftPercent, title(card))
                : (
                  <RemainingMeter
                    left={card.best.leftPercent}
                    timeLeft={card.best.timeLeftPercent}
                    label={`${title(card)} ${copy("kaldı", "left")}`}
                  />
                )}
              {card.accounts.length > 1 ? (
                <View style={{ gap: space.sm, marginTop: space.xs }}>
                  {card.accounts.map((account) => {
                    const countdown = resetCountdown(account.reading.resetsAt, now, locale, units);
                    return (
                      <View key={account.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                        <View style={{ flex: 1, minWidth: 0 }}>{namedMeter(account, mixedKinds, null, title(card))}</View>
                        <Body muted numberOfLines={1} importantForAccessibility="no" accessibilityElementsHidden
                          style={[uiStyles.caption, { fontVariant: ["tabular-nums"], flexShrink: 0 }]}>
                          {countdown ? `${wholePercent(account.reading.leftPercent)}% · ${countdown}` : `${wholePercent(account.reading.leftPercent)}%`}
                        </Body>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
            );
          })}
        </View>
        );
      })}
    </View>
  );
}
