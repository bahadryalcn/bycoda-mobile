import { useEffect, useEffectEvent } from "react";
import { Linking, View } from "react-native";
import CircleCheck from "lucide-react-native/icons/circle-check";
import CircleX from "lucide-react-native/icons/circle-x";
import Clock from "lucide-react-native/icons/clock";
import CircleSlash from "lucide-react-native/icons/circle-slash";
import CircleMinus from "lucide-react-native/icons/circle-minus";
import CircleHelp from "lucide-react-native/icons/circle-help";
import Copy from "lucide-react-native/icons/copy";
import { Body, Disclosure, IconButton, NavigationGroup, NavigationRow, QueryState, StateView, showToast } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import { getQueryPresentation } from "@/ui/query-presentation";
import { iconSize, radii, space } from "@/ui/tokens";
import type { QueryLike } from "@/ui/query-presentation";
import { CheckRowsSkeleton } from "../../inbox/record-skeletons";
import type { PrChecks } from "../model/results";
import { prCheckBucket, prChecksSummary, prCheckUrl, shortSha, sortPrChecks, type PrCheckBucket } from "../model/checks";

/**
 * Checks: a one-line summary ("8 passed · 1 skipped") on a disclosure that opens by itself only
 * when something failed or is still running; each row has a coloured status glyph, the check
 * name, its workflow dimmed, and opens the check on the provider when it has a link.
 */
export function PrChecksSection({ checks }: { checks: QueryLike & { data?: PrChecks } }) {
  const copy = useCopy();
  const data = checks.data;
  const summary = data ? prChecksSummary(data.checks) : [];
  const countLabel = (bucket: PrCheckBucket, count: number) => {
    const p0 = String(count);
    return bucket === "pass" ? copy("{p0} başarılı", "{p0} passed", { p0 })
      : bucket === "fail" ? copy("{p0} başarısız", "{p0} failed", { p0 })
      : bucket === "pending" ? copy("{p0} bekliyor", "{p0} pending", { p0 })
      : bucket === "skipping" ? copy("{p0} atlandı", "{p0} skipped", { p0 })
      : bucket === "cancel" ? copy("{p0} iptal edildi", "{p0} cancelled", { p0 })
      : copy("{p0} bilinmiyor", "{p0} unknown", { p0 });
  };
  const attention = summary.some(({ bucket }) => bucket === "fail" || bucket === "pending");
  return (
    // Keyed by the loaded state so a run that needs attention opens once its result arrives.
    <Disclosure key={data ? `ready:${attention}` : "loading"} label={copy("Kontroller", "Checks")}
      detail={summary.map(({ bucket, count }) => countLabel(bucket, count)).join(" · ") || undefined}
      tone={summary.some(({ bucket }) => bucket === "fail") ? "danger" : undefined}
      defaultExpanded={!data || attention}>
      {/* Shaped like the check rows; a failed or timed-out read is a compact line with Retry. */}
      {getQueryPresentation(checks) === "loading" ? <CheckRowsSkeleton /> : null}
      <QueryState size="compact" loading="none" query={checks} />
      {data ? <>
        <ShaChip sha={data.headOid} />
        {data.checks.length === 0 ? <StateView size="compact" title={copy("Kontrol yok", "No checks")} /> : (
          <NavigationGroup>
            {sortPrChecks(data.checks).map((check, index) => <PrCheckRow key={`${check.name}:${index}`} check={check} />)}
          </NavigationGroup>
        )}
      </> : null}
    </Disclosure>
  );
}

function PrCheckRow({ check }: { check: PrChecks["checks"][number] }) {
  const copy = useCopy();
  const { colors, semanticColors } = useMobileTheme();
  const bucket = prCheckBucket(check.state);
  const labels: Record<PrCheckBucket, string> = { pass: copy("Başarılı", "Passed"), fail: copy("Başarısız", "Failed"), pending: copy("Bekliyor", "Pending"),
    skipping: copy("Atlandı", "Skipped"), cancel: copy("İptal edildi", "Cancelled"), unknown: copy("Bilinmiyor", "Unknown") };
  const Icon = { pass: CircleCheck, fail: CircleX, pending: Clock, skipping: CircleSlash, cancel: CircleMinus, unknown: CircleHelp }[bucket];
  const color = bucket === "pass" ? semanticColors.success.text : bucket === "fail" ? semanticColors.danger.text
    : bucket === "pending" ? colors.accent : colors.muted;
  const url = prCheckUrl(check.url);
  return (
    <NavigationRow
      label={check.name || check.workflow}
      detail={check.name && check.workflow ? check.workflow : undefined}
      accessibilityLabel={[check.workflow, check.name, labels[bucket]].filter(Boolean).join(", ")}
      icon={<Icon size={iconSize.row} strokeWidth={1.8} color={color} />}
      trailing={<Body muted>{labels[bucket]}</Body>}
      intent={url ? "navigate" : "command"}
      disabled={!url}
      onPress={() => { if (url) void Linking.openURL(url).catch(() => showToast({ tone: "danger", message: copy("Bağlantı açılamadı.", "Could not open the link.") })); }}
    />
  );
}

/** The checked commit as a short SHA chip; the copy button copies the full SHA. */
function ShaChip({ sha }: { sha: string }) {
  const copy = useCopy();
  const { colors, uiStyles } = useMobileTheme();
  const clipboard = useClipboardFeedback(sha);
  const announce = useEffectEvent((failed: boolean) => showToast(failed
    ? { tone: "danger", message: copy("Kopyalanamadı. Yeniden deneyin.", "Could not copy. Try again.") }
    : { message: copy("Kopyalandı", "Copied") }));
  useEffect(() => { if (clipboard.copied) announce(false); }, [clipboard.copied]);
  useEffect(() => { if (clipboard.error) announce(true); }, [clipboard.error]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
      <View style={{ paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radii.badge, backgroundColor: colors.panel }}>
        <Body mono muted selectable style={uiStyles.caption}>{shortSha(sha)}</Body>
      </View>
      <IconButton label={copy("Commit SHA’sını kopyala: {p0}", "Copy commit SHA: {p0}", { p0: shortSha(sha) })} disabled={clipboard.busy} onPress={clipboard.copy}>
        <Copy size={iconSize.inline} color={colors.muted} />
      </IconButton>
    </View>
  );
}
