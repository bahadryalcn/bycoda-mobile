import { useMobileTheme } from "@/ui/theme";
import { useLayoutEffect, useRef, useState } from "react";
import Constants from "expo-constants";
import { findNodeHandle, Linking, Share, View, type HostInstance } from "react-native";
import Animated from "react-native-reanimated";
import Star from "lucide-react-native/icons/star";
import Share2 from "lucide-react-native/icons/share-2";
import Globe from "lucide-react-native/icons/globe";
import MessageSquare from "lucide-react-native/icons/message-square";
import Flag from "lucide-react-native/icons/flag";
import { router, type Href } from "expo-router";
import { Body, Notice, Stack, Disclosure, NavigationGroup, NavigationRow } from "../../ui/primitives";
import { IconTile } from "../../ui/icon-tile";
import { enterItem } from "../../ui/motion";
import { space } from "../../ui/tokens";
import { useCopy } from "../../ui/copy";
import { appIdentity, engagementLinks } from "./engagement-model";
import { openPublicLink, sharePublicApp } from "./engagement-actions";

function tile(Glyph: typeof Star, color: string) {
  return (
    <IconTile color={color}>
      <Glyph size={18} strokeWidth={2} color={color} />
    </IconTile>
  );
}

/** User initiated public actions. This does not publish through connected social accounts. */
export function EngagementSettings() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const platform = process.env.EXPO_OS ?? "unknown";
  const links = engagementLinks(Constants.expoConfig, platform);
  const identity = appIdentity(Constants, platform);
  const shareAnchor = useRef<HostInstance>(null);
  const pending = useRef(false);
  const active = useRef(true);
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [feedbackFor, setFeedbackFor] = useState<"review" | "share" | "public" | null>(null);
  const [busy, setBusy] = useState<
    "review" | "share" | "public" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const nativeSharing = platform === "ios" || platform === "android";

  async function perform(action: NonNullable<typeof busy>) {
    if (!active.current || pending.current || (action === "share" && !nativeSharing) || (action === "review" && !links.reviewUrl)) return;
    pending.current = true;
    setBusy(action);
    setFeedbackFor(action);
    setError(null);
    setNotice(null);
    try {
      if (action === "share") {
        const result = await sharePublicApp(
          links,
          platform,
          copy,
          (content) => {
            const anchor =
              platform === "ios" && shareAnchor.current
                ? findNodeHandle(shareAnchor.current)
                : null;
            return Share.share(content, {
              dialogTitle: copy("bycoda’yı paylaş", "Share bycoda"),
              subject: "bycoda",
              ...(anchor ? { anchor } : {}),
            });
          },
        );
        if (!active.current) return;
        if (result === "dismissed")
          setNotice(copy("Paylaşım iptal edildi.", "Sharing was cancelled."));
        if (result === "failed" || result === "unavailable") {
          setError(
            copy(
              "Paylaşım menüsü açılamadı. Aşağıdaki herkese açık bağlantıyı kullanabilirsin.",
              "The share sheet could not be opened. You can use the public link below.",
            ),
          );
        }
      } else {
        const url = action === "review" ? links.reviewUrl : links.shareUrl;
        const result = await openPublicLink(url, (target) =>
          Linking.openURL(target),
        );
        if (!active.current) return;
        if (result !== "opened") {
          setError(
            copy(
              "Bağlantı açılamadı. İnternet bağlantını ve tarayıcını kontrol et.",
              "The link could not be opened. Check your internet connection and browser.",
            ),
          );
        }
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(null);
    }
  }

  const feedback = (action: NonNullable<typeof busy>) => feedbackFor === action ? <Stack style={{ gap: space.sm }}>
    {notice ? <Body accessibilityLiveRegion="polite" muted>{notice}</Body> : null}
    {error ? <Notice tone="warning" message={error} /> : null}
  </Stack> : null;

  return (
    <Stack style={{ gap: space.lg }}>
      <Stack>
        <Body>bycoda · {copy("Sürüm: ", "Version: ")}{identity.version ?? copy("Bilinmiyor", "Unknown")}</Body>
        <Body muted>{identity.preview
          ? copy("Önizleme — mağaza derlemesi değil.", "Preview — a store build is not running.")
          : `${copy("Derleme: ", "Build: ")}${identity.nativeBuild ?? copy("Bilinmiyor", "Unknown")}`}</Body>
      </Stack>
      <Animated.View entering={enterItem(0)}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Uygulamayı değerlendir", "Rate the app")}
            disabled={!!busy || !links.reviewUrl}
            detail={!links.reviewUrl ? copy("Mağazada yayımlandığında kullanılabilir.", "Available after the store release.") : undefined}
            detailLines={2}
            icon={tile(Star, colors.muted)}
            busy={busy === "review"}
            onPress={() => { void perform("review"); }}
          />
          {feedback("review")}
          <View ref={shareAnchor} collapsable={false}>
            <NavigationRow
              label={copy("Uygulamayı paylaş", "Share the app")}
              intent="command"
              disabled={!!busy || !nativeSharing}
              icon={tile(Share2, colors.muted)}
              busy={busy === "share"}
              onPress={() => { void perform("share"); }}
            />
          </View>
          {feedback("share")}
          <NavigationRow
            label={copy("Uygulama sayfası", "App page")}
            disabled={!!busy}
            icon={tile(Globe, colors.muted)}
            busy={busy === "public"}
            onPress={() => { void perform("public"); }}
          />
          {feedback("public")}
          <NavigationRow
            label={copy("Geri bildirim gönder", "Send feedback")}
            disabled={!!busy}
            icon={tile(MessageSquare, colors.muted)}
            onPress={() => router.push("/feedback" as Href)}
          />
          <NavigationRow
            label={copy("İçerik bildir", "Report content")}
            disabled={!!busy}
            icon={tile(Flag, colors.muted)}
            onPress={() => router.push("/report")}
          />
        </NavigationGroup>
      </Animated.View>
      <NavigationGroup>
        <Disclosure label={copy("Bağlantılar", "Links")}>
          <Body muted selectable>{links.shareUrl}</Body>
        </Disclosure>
      </NavigationGroup>
    </Stack>
  );
}
