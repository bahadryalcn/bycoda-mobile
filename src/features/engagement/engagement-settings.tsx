import { useLayoutEffect, useRef, useState } from "react";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { findNodeHandle, Linking, Share, View, type HostInstance } from "react-native";
import Animated from "react-native-reanimated";
import Star from "lucide-react-native/icons/star";
import Share2 from "lucide-react-native/icons/share-2";
import Globe from "lucide-react-native/icons/globe";
import Smartphone from "lucide-react-native/icons/smartphone";
import ExternalLink from "lucide-react-native/icons/external-link";
import { useMobileTheme } from "../../ui/theme";
import { Body, Notice, Stack, NavigationGroup, NavigationRow, SettingIcon, ValueRow } from "../../ui/primitives";
import { enterItem } from "../../ui/motion";
import { iconSize, space } from "../../ui/tokens";
import { useCopy } from "../../ui/copy";
import { appIdentity, engagementLinks } from "./engagement-model";
import { openPublicLink, sharePublicApp } from "./engagement-actions";
import { websiteUrl } from "../legal/legal-content";
import { BrandLogo } from "@/ui/brand";

/**
 * Settings → About: version and build, then user initiated public actions. This does not publish
 * through connected social accounts. Feedback has its own row on the Settings index.
 */
export function EngagementSettings() {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  // Rows that leave the app are commands with the external-link mark, as in the legal documents.
  const external = <ExternalLink size={iconSize.status} color={colors.muted} />;
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
  const nativeSharing = platform === "ios" || platform === "android";

  async function perform(action: NonNullable<typeof busy>) {
    if (!active.current || pending.current || (action === "share" && !nativeSharing) || (action === "review" && !links.reviewUrl) || (action === "public" && !links.appPageUrl)) return;
    pending.current = true;
    setBusy(action);
    setFeedbackFor(action);
    setError(null);
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
        // Closing the share sheet is the person's own choice; only a failure is reported.
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
      <NavigationGroup>
        <ValueRow label={copy("Sürüm", "Version")} value={identity.version ?? copy("Bilinmiyor", "Unknown")} />
        <ValueRow label={copy("Derleme", "Build")} value={identity.preview
          ? copy("Önizleme, mağaza derlemesi değil", "Preview, not a store build")
          : identity.nativeBuild ?? copy("Bilinmiyor", "Unknown")} />
      </NavigationGroup>
      <Animated.View entering={enterItem(0)}>
        <NavigationGroup>
          <NavigationRow
            label={copy("bycoda web sitesi", "bycoda website")}
            detail="bycoda.codes"
            intent="command"
            trailing={external}
            disabled={!!busy}
            icon={<SettingIcon glyph={Globe} />}
            busy={busy === "website"}
            onPress={() => { void perform("website"); }}
          />
          {/* Hidden until a store review URL exists; a permanently disabled row explains nothing useful. */}
          {links.reviewUrl ? (
            <NavigationRow
              label={copy("Uygulamayı değerlendir", "Rate the app")}
              intent="command"
              trailing={external}
              disabled={!!busy}
              icon={<SettingIcon glyph={Star} />}
              busy={busy === "review"}
              onPress={() => { void perform("review"); }}
            />
          ) : null}
          <View ref={shareAnchor} collapsable={false}>
            <NavigationRow
              label={copy("Uygulamayı paylaş", "Share the app")}
              intent="command"
              disabled={!!busy || !nativeSharing}
              icon={<SettingIcon glyph={Share2} />}
              busy={busy === "share"}
              onPress={() => { void perform("share"); }}
            />
          </View>
          {links.appPageUrl ? <>
            <NavigationRow
              label={copy("Uygulama sayfası", "App page")}
              intent="command"
              trailing={external}
              disabled={!!busy}
              icon={<SettingIcon glyph={Smartphone} />}
              busy={busy === "public"}
              onPress={() => { void perform("public"); }}
            />
          </> : null}
        </NavigationGroup>
        {error ? <Notice tone="warning" message={error} /> : null}
        {error && feedbackFor === "share" ? <Body muted selectable>{links.shareUrl}</Body> : null}
      </Animated.View>
    </Stack>
  );
}
