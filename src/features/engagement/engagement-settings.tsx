import { useMobileTheme } from "@/ui/theme";
import { useLayoutEffect, useRef, useState } from "react";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { findNodeHandle, Linking, Share, View, type HostInstance } from "react-native";
import Animated from "react-native-reanimated";
import Star from "lucide-react-native/icons/star";
import Share2 from "lucide-react-native/icons/share-2";
import Globe from "lucide-react-native/icons/globe";
import MessageSquare from "lucide-react-native/icons/message-square";
import Smartphone from "lucide-react-native/icons/smartphone";
import { router, type Href } from "expo-router";
import { Body, Notice, Stack, NavigationGroup, NavigationRow } from "../../ui/primitives";
import { IconTile } from "../../ui/icon-tile";
import { enterItem } from "../../ui/motion";
import { space } from "../../ui/tokens";
import { useCopy } from "../../ui/copy";
import { appIdentity, engagementLinks } from "./engagement-model";
import { openPublicLink, sharePublicApp } from "./engagement-actions";
import { websiteUrl } from "../legal/legal-content";
import { BrandLogo } from "@/ui/brand";

function tile(Glyph: typeof Star, color: string) {
  return (
    <IconTile color={color}>
      <Glyph size={18} strokeWidth={2} color={color} />
    </IconTile>
  );
}

/**
 * User initiated public actions. This does not publish through connected social accounts.
 * `leaveSheet` closes the hosting sheet before running a navigation.
 */
export function EngagementSettings({ leaveSheet }: { leaveSheet: (go: () => void) => void }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const platform = process.env.EXPO_OS ?? "unknown";
  const links = engagementLinks(Constants.expoConfig, platform);
  const identity = appIdentity(Constants, platform, Application);
  const shareAnchor = useRef<HostInstance>(null);
  const pending = useRef(false);
  const active = useRef(true);
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [feedbackFor, setFeedbackFor] = useState<"review" | "share" | "public" | "website" | null>(null);
  const [busy, setBusy] = useState<
    "review" | "share" | "public" | "website" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const nativeSharing = platform === "ios" || platform === "android";

  async function perform(action: NonNullable<typeof busy>) {
    if (!active.current || pending.current || (action === "share" && !nativeSharing) || (action === "review" && !links.reviewUrl) || (action === "public" && !links.appPageUrl)) return;
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
        const url = action === "review" ? links.reviewUrl : action === "website" ? websiteUrl : links.appPageUrl;
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

  return (
    <Stack style={{ gap: space.lg }}>
      <BrandLogo compact />
      <Stack>
        <Body>{copy("Sürüm: {p0}", "Version: {p0}", { p0: identity.version ?? copy("Bilinmiyor", "Unknown") })}</Body>
        <Body muted>{identity.preview
          ? copy("Önizleme — mağaza derlemesi değil.", "Preview — a store build is not running.")
          : copy("Derleme: {p0}", "Build: {p0}", { p0: identity.nativeBuild ?? copy("Bilinmiyor", "Unknown") })}</Body>
      </Stack>
      <Animated.View entering={enterItem(0)}>
        <NavigationGroup>
          <NavigationRow
            label={copy("bycoda web sitesi", "bycoda website")}
            detail="bycoda.codes"
            disabled={!!busy}
            icon={tile(Globe, colors.muted)}
            busy={busy === "website"}
            onPress={() => { void perform("website"); }}
          />
          <NavigationRow
            label={copy("Uygulamayı değerlendir", "Rate the app")}
            disabled={!!busy || !links.reviewUrl}
            detail={!links.reviewUrl ? copy("Mağazada yayımlandığında kullanılabilir.", "Available after the store release.") : undefined}
            detailLines={2}
            icon={tile(Star, colors.muted)}
            busy={busy === "review"}
            onPress={() => { void perform("review"); }}
          />
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
          {links.appPageUrl ? <>
            <NavigationRow
              label={copy("Uygulama sayfası", "App page")}
              disabled={!!busy}
              icon={tile(Smartphone, colors.muted)}
              busy={busy === "public"}
              onPress={() => { void perform("public"); }}
            />
          </> : null}
          <NavigationRow
            label={copy("Geri bildirim gönder", "Send feedback")}
            disabled={!!busy}
            icon={tile(MessageSquare, colors.muted)}
            onPress={() => leaveSheet(() => router.push("/feedback" as Href))}
          />
        </NavigationGroup>
        {notice ? <Body accessibilityLiveRegion="polite" muted>{notice}</Body> : null}
        {error ? <Notice tone="warning" message={error} /> : null}
        {error && feedbackFor === "share" ? <Body muted selectable>{links.shareUrl}</Body> : null}
      </Animated.View>
    </Stack>
  );
}
