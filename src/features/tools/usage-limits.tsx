import { ProviderAccountKind } from "@/ui/provider-account-kind";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { Body, Card, QueryState, SectionHeader } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { fontSize, radii, space } from "@/ui/tokens";
import { AccountMeter, RemainingMeter } from "@/ui/usage-meters";
import {
  readLimitsReport,
  resetCountdown,
  wholePercent,
  type UsageLimitsReport,
} from "./usage-limits-model";

type Card_ = UsageLimitsReport["providers"][number]["cards"][number];
const PROVIDER_NAMES = { claude: "Claude", codex: "Codex", opencode: "OpenCode" } as const;

/** Wall clock that ticks each minute so reset countdowns stay current. */
function useMinuteNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Provider quota windows from the Host: one card per window, one row per account. */
export function UsageLimits() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const now = useMinuteNow();
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
  const providers = query.data?.providers ?? [];
  const hasCards = providers.some((provider) => provider.cards.length > 0);
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
      ? copy("Hız üstünde", "Ahead of pace")
      : pace === "behind"
        ? copy("Hız altında", "Behind pace")
        : pace === "on"
          ? copy("Hızında", "On pace")
          : null;
  const resetLine = (reading: Card_["best"]) => {
    const left = resetCountdown(reading.resetsAt, now);
    return left
      ? copy("+%{p0} · {p1} içinde", "+{p0}% in {p1}", {
          p0: wholePercent(reading.regainPercent),
          p1: left,
        })
      : copy("Sıfırlanma zamanı bilinmiyor", "Reset time unknown");
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
        emptyTitle={copy("Limit okunamadı.", "No limit readings.")}
      />
      {providers.map((provider) => (
        <View key={provider.provider} style={{ gap: space.sm }}>
          <SectionHeader title={PROVIDER_NAMES[provider.provider]} />
          {provider.cards.map((card) => (
            <Card key={card.key} variant="surface">
              <View
                style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}
              >
                <Body style={{ fontWeight: "600", flexShrink: 1 }}>{title(card)}</Body>
                {paceText(card.best.pace) ? <Body muted>{paceText(card.best.pace)}</Body> : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}>
                <Body
                  mono
                  style={{ fontSize: fontSize.display, fontWeight: "600" }}
                >{`${wholePercent(card.best.leftPercent)}%`}</Body>
                <Body muted>{copy("kaldı", "left")}</Body>
              </View>
              <Body muted>{resetLine(card.best)}</Body>
              <RemainingMeter
                left={card.best.leftPercent}
                timeLeft={card.best.timeLeftPercent}
                label={`${title(card)} ${wholePercent(card.best.leftPercent)}%`}
              />
              <View style={{ gap: space.sm, marginTop: space.xs }}>
                {card.accounts.map((account) => {
                  const credits = provider.accounts.find(
                    (entry) => entry.id === account.id,
                  )?.resetCredits;
                  const countdown = resetCountdown(account.reading.resetsAt, now);
                  return (
                    <View key={account.id} style={{ gap: space.xs }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                        <View
                          accessible={false}
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: radii.pill,
                            backgroundColor: account.color,
                          }}
                        />
                        <Body style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
                          {account.label}
                        </Body>
                        <ProviderAccountKind
                          kind={account.kind}
                          derivedKind={account.derivedKind}
                        />
                        <Body mono>{`${wholePercent(account.reading.leftPercent)}%`}</Body>
                        {countdown ? <Body muted>{countdown}</Body> : null}
                        {credits ? <Body muted>{`+${credits}`}</Body> : null}
                      </View>
                      <AccountMeter
                        left={account.reading.leftPercent}
                        label={`${account.label} ${wholePercent(account.reading.leftPercent)}%`}
                      />
                    </View>
                  );
                })}
              </View>
            </Card>
          ))}
          {provider.accounts
            .filter((account) => account.status !== "ok")
            .map((account) => (
              <View
                key={account.id}
                style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
              >
                <View
                  accessible={false}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: radii.pill,
                    backgroundColor: account.color,
                  }}
                />
                <ProviderAccountKind kind={account.kind} derivedKind={account.derivedKind} />
                <Body
                  muted
                  style={{ flex: 1, minWidth: 0 }}
                >{`${account.label}: ${account.status === "unavailable" ? copy("kullanılamıyor", "unavailable") : copy("okunamadı", "could not be read")}`}</Body>
              </View>
            ))}
        </View>
      ))}
      <Body muted>
        {copy(
          "Yüzdeler hesaplar ve pencereler arasında toplanmaz.",
          "Percentages are per account and window; they are not pooled.",
        )}
      </Body>
    </View>
  );
}
