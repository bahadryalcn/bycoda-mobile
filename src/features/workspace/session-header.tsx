import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { router, useCanGoBack, useIsFocused } from "expo-router";
import { KeyboardController } from "react-native-keyboard-controller";
import { useBackHandler } from "panelui-native/hooks/use-back-handler";
import { useSecurity } from "@/state/security";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body } from "@/ui/typography";
import { HeaderBackButton } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, metrics, radii, space } from "@/ui/tokens";
import type { MobileColors } from "@/ui/tokens";
import { ProviderIcon } from "@/ui/provider-identity";
import { ChatAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import List from "lucide-react-native/icons/list";
import type { RemoteProvider } from "@/domain/types";
import { sessionDisplayTitle } from "./session-title";
import type { SessionHeaderTone } from "./session-header-model";

/**
 * Two icon buttons laid out at their 48dp touch size (plus gap), so a late snapshot
 * never shifts the title and a long title never runs under the actions.
 */
export const SESSION_HEADER_ACTIONS_WIDTH = metrics.touchTarget * 2 + space.xs;

const toneColor = (tone: SessionHeaderTone, colors: MobileColors) =>
  tone === "danger" ? colors.danger : tone === "warning" ? colors.warning : tone === "live" ? colors.live : colors.muted;

/** Tablet conversations have no header Back in split view. Keep a route out when launched without a stack. */
export function useTabletSessionBackFallback(tablet: boolean) {
  const focused = useIsFocused();
  const canGoBack = useCanGoBack();
  const unlocked = useSecurity((state) => state.status === "unlocked");
  useBackHandler(tablet && focused && unlocked && !canGoBack, () => {
    if (KeyboardController.isVisible()) {
      void KeyboardController.dismiss().catch(() => undefined);
      return;
    }
    router.replace("/chats");
  });
}

/** Compact 48dp header: back, title over "project · status", then fixed action slots. */
export function SessionHeader({
  title,
  context,
  status,
  tone,
  actions,
  provider,
  showBack = true,
  onShowSessions,
}: {
  title: string;
  context?: string;
  status: string;
  tone: SessionHeaderTone;
  actions?: ReactNode;
  /** Shown as an icon before the title; a "codex ·" title prefix is dropped. */
  provider?: RemoteProvider;
  showBack?: boolean;
  onShowSessions?: () => void;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const color = toneColor(tone, colors);
  return (
    <View
      style={{
        paddingTop: insets.top,
        // Same geometry as the stack header: 16dp gutter, 48dp back box, title starts at its edge.
        paddingLeft: Math.max(insets.left, space.screen),
        paddingRight: Math.max(insets.right, space.screen),
        paddingBottom: space.xs,
        backgroundColor: colors.background,
      }}
    >
      <View style={{ minHeight: metrics.headerHeight, flexDirection: "row", alignItems: "center" }}>
        {showBack ? <HeaderBackButton onPress={() => (router.canGoBack() ? router.back() : router.replace("/sessions"))} /> : null}
        {onShowSessions ? <ChatAction label={copy("Oturumlar", "Sessions")} onPress={onShowSessions}><List size={20} color={colors.muted} /></ChatAction> : null}
        <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            {provider ? <ProviderIcon provider={provider} size={16} /> : null}
            <Body numberOfLines={1} accessibilityRole="header" style={{ flex: 1, minWidth: 0, fontSize: fontSize.title, lineHeight: lineHeight.title, fontWeight: "600", color: colors.text }}>
              {sessionDisplayTitle(title, title)}
            </Body>
          </View>
          <View accessible accessibilityLabel={[context, status].filter(Boolean).join(", ")} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            {context ? (
              <Body muted numberOfLines={1} style={[uiStyles.caption, { flexShrink: 1, fontSize: fontSize.caption, lineHeight: lineHeight.caption }]}>
                {context}
              </Body>
            ) : null}
            <View accessible={false} style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 0, maxWidth: "60%" }}>
              {context ? <Text aria-hidden style={{ color: colors.tertiary, fontSize: fontSize.caption }}>·</Text> : null}
              <View style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: color }} />
              <Body numberOfLines={1} style={{ flexShrink: 1, fontSize: fontSize.caption, lineHeight: lineHeight.caption, fontWeight: "600", color }}>
                {status}
              </Body>
            </View>
          </View>
        </View>
        <View style={{ width: SESSION_HEADER_ACTIONS_WIDTH, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space.xs }}>
          {actions}
        </View>
      </View>
    </View>
  );
}
