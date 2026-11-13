import { useState } from "react";
import { View } from "react-native";
import { Spinner } from "panelui-native/components/spinner";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import { Body } from "@/ui/typography";
import { Badge } from "@/ui/feedback";
import { Button, PressableCard, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, radii, space } from "@/ui/tokens";
import type { Block } from "@/domain/types";
import { formatElapsed, isRunTurnStart, runStatus, type RunItem } from "./run-status-model";
import { useElapsedNow } from "./use-elapsed-now";

const MAX_ROWS = 5;

/**
 * Compact composer operating state; shared sheet owns details, keeping input reachable.
 * Unknown Host turn start shows Working without a fabricated elapsed time.
 */
type RunStatusCardProps = { blocks: readonly Block[] | undefined; live: boolean; onOpenAgents?: () => void };
export function RunStatusCard({ blocks, live, onOpenAgents }: RunStatusCardProps) {
  // A details opening belongs to this active turn; it cannot survive stop or a new user turn.
  return live ? <LiveRunStatusCard key={blocks?.findLast(isRunTurnStart)?.id ?? "unrecorded"} blocks={blocks} onOpenAgents={onOpenAgents} /> : null;
}

function LiveRunStatusCard({ blocks, onOpenAgents }: Omit<RunStatusCardProps, "live">) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const status = runStatus(blocks ?? [], true);
  const now = useElapsedNow(true);
  const { subagents } = status;
  const elapsed = status.startedAt !== undefined && status.startedAt <= now ? formatElapsed(now - status.startedAt) : undefined;
  const label = [copy("Çalışıyor", "Working"), elapsed].filter(Boolean).join(" ");
  const parts = [
    subagents.total ? copy("{p0}/{p1} alt ajan bitti", "{p0}/{p1} subagents done", { p0: subagents.done + subagents.failed, p1: subagents.total }) : "",
    status.tools ? copy("{p0} araç çalışıyor", "{p0} tools running", { p0: status.tools }) : "",
    status.waiting ? copy("{p0} onay bekliyor", "{p0} awaiting approval", { p0: status.waiting }) : "",
  ].filter(Boolean);
  const rows = status.running.slice(0, MAX_ROWS);
  return (
    <>
      <PressableCard
        label={[label, ...parts].join(". ")}
        expanded={open}
        onPress={() => setOpen(true)}
        style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.row,
          paddingVertical: space.sm, paddingHorizontal: space.sm, marginHorizontal: 0,
          borderRadius: radii.pill, maxWidth: "100%", flexShrink: 1 }}
      >
        <Spinner size="sm" color={colors.info} />
        <Body style={{ flexShrink: 1, fontSize: fontSize.control, lineHeight: lineHeight.control, fontVariant: ["tabular-nums"] }}>
          {label}
        </Body>
        <ChevronDown size={16} color={colors.tertiary} />
      </PressableCard>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        <View style={{ gap: space.sm }}>
          {parts.length ? <Body muted>{parts.join(" · ")}</Body> : null}
          {rows.map((item) => (
            <RunRow key={item.id} item={item} now={now} />
          ))}
          {onOpenAgents && subagents.total ? (
            <Button label={copy("Ajanlar ({p0})", "Agents ({p0})", { p0: subagents.total })} tone="quiet" onPress={() => { setOpen(false); onOpenAgents(); }} />
          ) : null}
          {status.running.length > rows.length ? (
            <Body muted>{copy("+{p0} daha", "+{p0} more", { p0: status.running.length - rows.length })}</Body>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}

function RunRow({ item, now }: { item: RunItem; now: number }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const detail = item.detail && item.detail !== item.title ? item.detail : undefined;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.row }}>
      <View style={{ width: 8, height: 8, borderRadius: radii.pill, backgroundColor: item.waiting ? colors.warning : colors.info }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body numberOfLines={1}>{item.title}</Body>
        {detail ? <Body muted numberOfLines={1} style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>{detail}</Body> : null}
      </View>
      {item.waiting ? <Badge label={copy("Onay", "Approval")} tone="warning" /> : null}
      {item.startedAt !== undefined && Number.isFinite(item.startedAt) && item.startedAt >= 0 && item.startedAt <= now ? <Body muted style={{ fontVariant: ["tabular-nums"] }}>{formatElapsed(now - item.startedAt)}</Body> : null}
    </View>
  );
}
