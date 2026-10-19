import { useRef, useState } from "react";
import Constants from "expo-constants";
import { findNodeHandle, Linking, Share, View } from "react-native";
import Animated from "react-native-reanimated";
import Star from "lucide-react-native/icons/star";
import Share2 from "lucide-react-native/icons/share-2";
import Globe from "lucide-react-native/icons/globe";
import Mail from "lucide-react-native/icons/mail";
import { Body, ErrorText, Stack, Disclosure, NavigationGroup, NavigationRow } from "../../ui/primitives";
import { IconTile } from "../../ui/icon-tile";
import { enterItem } from "../../ui/motion";
import { colors, space } from "../../ui/tokens";
import { useCopy } from "../../ui/copy";
import { supportEmail } from "../legal/legal-content";
import { appIdentity, engagementLinks, feedbackUrl } from "./engagement-model";
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
  const copy = useCopy();
  const platform = process.env.EXPO_OS ?? "unknown";
  const links = engagementLinks(Constants.expoConfig, platform);
  const identity = appIdentity(Constants, platform);
  const shareAnchor = useRef<View>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState<
    "review" | "share" | "public" | "feedback" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const nativeSharing = platform === "ios" || platform === "android";

  async function perform(action: NonNullable<typeof busy>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(action);
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
        const url =
          action === "review"
            ? links.reviewUrl
            : action === "feedback"
              ? feedbackUrl(identity, platform, copy)
              : links.shareUrl;
        const result = await openPublicLink(url, (target) =>
          Linking.openURL(target),
        );
        if (result !== "opened") {
          setError(
            action === "feedback"
              ? copy(
                  "E-posta uygulaması açılamadı. Destek adresini kopyalayıp kendi e-posta uygulamanda kullanabilirsin.",
                  "The email app could not be opened. Copy the support address into your email app.",
                )
              : copy(
                  "Bağlantı açılamadı. İnternet bağlantını ve tarayıcını kontrol et.",
                  "The link could not be opened. Check your internet connection and browser.",
                ),
          );
        }
      }
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  return (
    <Stack style={{ gap: space.lg }}>
      <Animated.View entering={enterItem(0)}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Uygulamayı değerlendir", "Rate the app")}
            disabled={!!busy || !links.reviewUrl}
            detail={!links.reviewUrl ? copy("Mağazada yayımlandığında kullanılabilir.", "Available after the store release.") : undefined}
            icon={tile(Star, colors.warning)}
            onPress={() => { void perform("review"); }}
          />
          <View ref={shareAnchor} collapsable={false}>
            <NavigationRow
              label={copy("Uygulamayı paylaş", "Share the app")}
              disabled={!!busy || !nativeSharing}
              icon={tile(Share2, colors.accent)}
              onPress={() => { void perform("share"); }}
            />
          </View>
          <NavigationRow
            label={copy("Uygulama sayfası", "App page")}
            disabled={!!busy}
            icon={tile(Globe, colors.info)}
            onPress={() => { void perform("public"); }}
          />
          <NavigationRow
            label={copy("Geri bildirim gönder", "Send feedback")}
            detail={supportEmail}
            disabled={!!busy}
            icon={tile(Mail, colors.muted)}
            onPress={() => { void perform("feedback"); }}
          />
        </NavigationGroup>
      </Animated.View>
      {notice ? <Body accessibilityLiveRegion="polite" muted>{notice}</Body> : null}
      <ErrorText error={error} />
      <NavigationGroup>
        <Disclosure label={copy("Sürüm ve bağlantılar", "Version & links")}>
          <Body>
            {copy("Sürüm: ", "Version: ")}
            {identity.version ?? copy("Bilinmiyor", "Unknown")}
          </Body>
          <Body muted>
            {identity.preview
              ? copy("Önizleme — mağaza derlemesi değil.", "Preview — a store build is not running.")
              : `${copy("Derleme: ", "Build: ")}${identity.nativeBuild ?? copy("Bilinmiyor", "Unknown")}`}
          </Body>
          <Body muted selectable>{links.shareUrl}</Body>
          <Body muted>
            {copy(
              "E-posta uygulaman sürüm bilgisiyle açılır. Mesajını inceleyip kendin gönderirsin.",
              "Your email app opens with version details. Review and send the message yourself.",
            )}
          </Body>
        </Disclosure>
      </NavigationGroup>
    </Stack>
  );
}
