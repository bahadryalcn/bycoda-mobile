import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { Body, Button, Section, Stack } from "@/ui/primitives";
import { MetricRow } from "@/ui/metric-row";
import { useCopy } from "@/ui/copy";
import { activitySummaryQuery, splitMinutes } from "../model/activity-query";
import { useAccount } from "./account-context";

const currentPeriod = () => activitySummaryQuery(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

/** Active time from the account service: today, week, month and year in the phone's time zone. */
export function ActivitySection() {
  const copy = useCopy();
  const { runtime, device } = useAccount();
  const [query, setQuery] = useState(currentPeriod);
  // The account screen can stay mounted overnight or while the phone time zone changes.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      const next = currentPeriod();
      setQuery((current) => current.date === next.date && current.timeZone === next.timeZone ? current : next);
      timer = setTimeout(refresh, 60_000 - Date.now() % 60_000);
    };
    const subscription = AppState.addEventListener("change", (state) => {
      clearTimeout(timer);
      if (state === "active") refresh();
    });
    if (!AppState.currentState || AppState.currentState === "active") refresh();
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);
  const summary = useQuery({
    queryKey: ["account", "activity", query.date, query.timeZone],
    queryFn: () => runtime!.client.getActivitySummary({ query }),
    enabled: !!runtime && !!device,
  });
  const format = (minutes: number) => {
    const { hours, minutes: rest } = splitMinutes(minutes);
    return hours ? copy("{p0} sa {p1} dk", "{p0}h {p1}m", { p0: hours, p1: rest }) : copy("{p0} dk", "{p0}m", { p0: rest });
  };
  return (
    <Section title={copy("Aktif süre", "Active time")}>
      <Stack>
        {summary.data ? (
          <>
            <MetricRow label={copy("Bugün", "Today")} value={format(summary.data.today)} />
            <MetricRow label={copy("Bu hafta", "This week")} value={format(summary.data.week)} />
            <MetricRow label={copy("Bu ay", "This month")} value={format(summary.data.month)} />
            <MetricRow label={copy("Bu yıl", "This year")} value={format(summary.data.year)} />
          </>
        ) : (
          <>
          <Body muted>
            {summary.isError
              ? copy("Aktif süre şu an alınamadı.", "Active time could not be loaded right now.")
              : copy("Yükleniyor…", "Loading…")}
          </Body>
          {summary.isError ? <Button label={copy("Yeniden dene", "Try again")} busy={summary.isFetching} disabled={summary.isFetching} onPress={() => void summary.refetch()} /> : null}
          </>
        )}
      </Stack>
    </Section>
  );
}
