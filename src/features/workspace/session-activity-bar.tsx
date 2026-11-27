import type { ComponentType } from "react";
import { ScrollView, View } from "react-native";
import Globe from "lucide-react-native/icons/globe";
import Smartphone from "lucide-react-native/icons/smartphone";
import { ChatStreaming } from "@/ui/chat-activity";
import { Body } from "@/ui/typography";
import { PressableCard } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, metrics, radii, space } from "@/ui/tokens";
import { activityBarLabel, type SessionActivity } from "./session-activity-model";

type Props = {
  activity: SessionActivity;
  /** Short name of the held device; omitted when the Host cannot say which. */
  device?: { name?: string; platform?: string };
  /** Host name of the held browser page; omitted when unknown. */
  browser?: { host?: string };
  onDevice: () => void;
  onBrowser: () => void;
  /** False where the session's floating status cluster already says the state (the session screen). */
  showState?: boolean;
};

const BAR_HEIGHT = metrics.touchTarget;

/**
 * One borderless line above the composer for what the transcript does not already say: waiting on
 * agents or background work, needing the owner, just done, then quiet segments for the device and
 * browser in use. Plain working and its clock belong to the transcript's live row, and subagents
 * to the transcript's rows and floating pill, so neither shows twice. Segments scroll sideways
 * instead of wrapping. On the session screen the state moves into the floating status cluster and
 * this line keeps only the device and browser.
 */
export function SessionActivityBar({ activity, device, browser, onDevice, onBrowser, showState = true }: Props) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const label = showState ? activityBarLabel(activity, copy) : "";
  if (!label && !device && !browser) return null;
  const busy = activity.state === "waiting" || activity.state === "background";
  const dot = activity.state === "needs-input" ? colors.warning : activity.state === "done" ? colors.success : colors.tertiary;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", minHeight: BAR_HEIGHT, flexGrow: 1, flexShrink: 1, flexBasis: 240, minWidth: 0,
      paddingHorizontal: space.xs, gap: space.sm }}>
      {label ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 0, maxWidth: "60%" }}>
          {/* Only the state is a live region: the timer changes every second and must not be re-announced. */}
          <View accessible accessibilityLabel={label} accessibilityLiveRegion="polite"
            style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 }}>
            {busy ? <ChatStreaming label={label} priority={2} /> : <>
              <View style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: dot }} />
              <Body muted style={{ flexShrink: 1, fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>{label}</Body>
            </>}
          </View>
        </View>
      ) : null}
      {/* Rails neither bounce nor glow at their edges. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false} overScrollMode="never" style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", alignItems: "center", gap: space.xs }}>
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
