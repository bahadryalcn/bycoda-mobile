import { useState } from "react";
import { View } from "react-native";
import { Spinner } from "panelui-native/components/spinner";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import Users from "lucide-react-native/icons/users";
import { Body } from "@/ui/typography";
import { Badge } from "@/ui/feedback";
import { Button, PressableCard } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, hitSlopFor, lineHeight, metrics, radii, space } from "@/ui/tokens";
import type { Block } from "@/domain/types";
import { formatElapsed, hasRunStatus, runStatus, type RunItem } from "./run-status-model";
import { useElapsedNow } from "./use-elapsed-now";

const MAX_ROWS = 5;

/**
 * Live summary above the transcript while a session runs. Collapsed it is one slim pill
 * ("Working 10m · 3/8"); expanded it lists what each agent and tool is doing. Hidden when idle.
 */
export function RunStatusCard({ blocks, live, onOpenAgents }: { blocks: readonly Block[] | undefined; live: boolean; onOpenAgents?: () => void }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const status = runStatus(blocks ?? [], live);
  const visible = live && hasRunStatus(status);
  const now = useElapsedNow(visible);
  if (!visible) return null;
  const { subagents } = status;
  const elapsed = status.startedAt !== undefined ? formatElapsed(now - status.startedAt) : undefined;
  const label = [copy("Çalışıyor", "Working"), elapsed].filter(Boolean).join(" ");
  const parts = [
    subagents.total ? copy("{p0}/{p1} alt ajan bitti", "{p0}/{p1} subagents done", { p0: subagents.done + subagents.failed, p1: subagents.total }) : "",
    status.tools ? copy("{p0} araç çalışıyor", "{p0} tools running", { p0: status.tools }) : "",
    status.waiting ? copy("{p0} onay bekliyor", "{p0} awaiting approval", { p0: status.waiting }) : "",
  ].filter(Boolean);
  const rows = status.running.slice(0, MAX_ROWS);
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View
      style={{
        marginBottom: space.sm,
        borderRadius: open ? radii.card : radii.pill,
        backgroundColor: colors.raised,
        borderWidth: 1,
        borderColor: colors.separator,
      }}
    >
      <PressableCard
        label={[label, ...parts].join(". ")}
        expanded={open}
        onPress={() => setOpen(!open)}
        hitSlop={hitSlopFor(metrics.toolRowHeight)}
        style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: space.row, paddingVertical: 0, paddingHorizontal: space.lg, marginHorizontal: 0 }}
      >
        <Spinner size="sm" color={colors.info} />
        <Body numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: fontSize.control, lineHeight: lineHeight.control, fontVariant: ["tabular-nums"] }}>
          {label}
        </Body>
        {subagents.total ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Users size={14} color={colors.tertiary} />
            <Body muted style={{ fontVariant: ["tabular-nums"] }}>{subagents.running}/{subagents.total}</Body>
          </View>
        ) : null}
        <Chevron size={16} color={colors.tertiary} />
      </PressableCard>
      {open ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm }}>
          {parts.length ? <Body muted>{parts.join(" · ")}</Body> : null}
          {rows.map((item) => (
            <RunRow key={item.id} item={item} now={now} />
          ))}
          {onOpenAgents && subagents.total ? (
            <Button label={copy("Ajanlar ({p0})", "Agents ({p0})", { p0: subagents.total })} tone="quiet" onPress={onOpenAgents} />
          ) : null}
          {status.running.length > rows.length ? (
            <Body muted>{copy("+{p0} daha", "+{p0} more", { p0: status.running.length - rows.length })}</Body>
          ) : null}
        </View>
      ) : null}
    </View>
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
      {item.startedAt !== undefined ? <Body muted style={{ fontVariant: ["tabular-nums"] }}>{formatElapsed(now - item.startedAt)}</Body> : null}
    </View>
  );
}
