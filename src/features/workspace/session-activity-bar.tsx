import type { ComponentType } from "react";
import { ScrollView, View } from "react-native";
import Globe from "lucide-react-native/icons/globe";
import Smartphone from "lucide-react-native/icons/smartphone";
import Users from "lucide-react-native/icons/users";
import { ChatStreaming } from "@/ui/chat-activity";
import { Body } from "@/ui/typography";
import { PressableCard } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, metrics, radii, space } from "@/ui/tokens";
import { activityStateLabel, agentCountText, type SessionActivity } from "./session-activity-model";
import { formatElapsed } from "./run-status-model";
import { useElapsedNow } from "./use-elapsed-now";

type Props = {
  activity: SessionActivity;
  /** Short name of the held device; omitted when the Host cannot say which. */
  device?: { name?: string; platform?: string };
  /** Host name of the held browser page; omitted when unknown. */
  browser?: { host?: string };
  onAgents: () => void;
  onDevice: () => void;
  onBrowser: () => void;
};

const TIMED = new Set(["working", "waiting", "needs-input"]);
const BAR_HEIGHT = metrics.touchTarget;

/**
 * One borderless line above the composer: what the session is doing, then quiet segments for the
 * agents, device and browser it is using. Segments scroll sideways instead of wrapping.
 */
export function SessionActivityBar({ activity, device, browser, onAgents, onDevice, onBrowser }: Props) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const timed = TIMED.has(activity.state) && activity.startedAt !== undefined;
  const now = useElapsedNow(timed);
  const hasAgents = activity.counts.total > 0;
  if (activity.state === "idle" && !hasAgents && !device && !browser) return null;
  const elapsed = timed && activity.startedAt! <= now ? formatElapsed(now - activity.startedAt!) : undefined;
  const label = activityStateLabel(activity, copy);
  const busy = activity.state === "working" || activity.state === "waiting" || activity.state === "background";
  const dot = activity.state === "needs-input" ? colors.warning : activity.state === "done" ? colors.success : colors.tertiary;
  const agentLabel = activity.counts.total === 1 ? copy("1 ajan", "1 agent")
    : copy("{p0} ajan", "{p0} agents", { p0: activity.counts.total });
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: BAR_HEIGHT, flexGrow: 1, flexShrink: 1, flexBasis: 240, minWidth: 0,
      paddingHorizontal: space.xs, gap: space.sm }}>
      {label ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 0, maxWidth: "60%" }}>
          {/* Only the state is a live region: the timer changes every second and must not be re-announced. */}
          <View accessible accessibilityLabel={label} accessibilityLiveRegion="polite"
            style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 }}>
            {busy ? <ChatStreaming label={label} /> : <>
              <View style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: dot }} />
              <Body muted style={{ flexShrink: 1, fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>{label}</Body>
            </>}
          </View>
          {/* Read on demand when focused; never announced on its own. */}
          {elapsed ? (
            <View accessible accessibilityRole="timer" accessibilityLabel={elapsed} accessibilityLiveRegion="none" style={{ flexShrink: 0 }}>
              <Body muted style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption, fontVariant: ["tabular-nums"] }}>{elapsed}</Body>
            </View>
          ) : null}
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", alignItems: "center", gap: space.xs }}>
        {hasAgents ? (
          <Segment Icon={Users} text={activity.counts.failed
            ? `${agentLabel} · ${copy("{p0} başarısız", "{p0} failed", { p0: activity.counts.failed })}`
            : agentLabel}
            a11y={`${agentLabel}. ${agentCountText(activity.counts, copy, true)}. ${copy("Ajanları aç", "Open agents")}`} onPress={onAgents} />
        ) : null}
        {device ? (
          <Segment Icon={Smartphone} text={device.name || copy("Cihaz", "Device")}
            a11y={[copy("Ajan şu cihazı kullanıyor", "Agent is using device"), device.name, device.platform].filter(Boolean).join(" ") + `. ${copy("Canlı görüntüyü aç", "Open live view")}`} onPress={onDevice} />
        ) : null}
        {browser ? (
          <Segment Icon={Globe} text={browser.host || copy("Tarayıcı", "Browser")}
            a11y={[copy("Ajan tarayıcıyı kullanıyor", "Agent is using the browser"), browser.host].filter(Boolean).join(" ") + `. ${copy("Tarayıcıyı aç", "Open browser")}`} onPress={onBrowser} />
        ) : null}
      </ScrollView>
    </View>
  );
}

function Segment({ Icon, text, a11y, onPress }: { Icon: ComponentType<{ size?: number; color?: string }>; text: string; a11y: string; onPress: () => void }) {
  const { colors } = useMobileTheme();
  return (
    <PressableCard label={a11y} onPress={onPress}
      style={{ minHeight: BAR_HEIGHT, flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: 0, paddingHorizontal: space.sm, marginHorizontal: 0,
        borderRadius: radii.pill, flexShrink: 0 }}>
      <Icon size={14} color={colors.muted} />
      <Body muted numberOfLines={1} style={{ fontSize: fontSize.small, lineHeight: lineHeight.small, fontVariant: ["tabular-nums"] }}>{text}</Body>
    </PressableCard>
  );
}
