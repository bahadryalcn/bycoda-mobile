import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Skeleton as PanelSkeleton } from "panelui-native/components/skeleton";
import Download from "lucide-react-native/icons/download";
import ImageIcon from "lucide-react-native/icons/image";
import ImageOff from "lucide-react-native/icons/image-off";
import RotateCcw from "lucide-react-native/icons/rotate-ccw";
import { decorativeSvgProps } from "./accessibility";
import { Body, PressableArea } from "./primitives";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { fontSize, space } from "./tokens";
import { useDelayedVisible } from "./use-delayed-visible";
import { useFeedbackAnimation } from "./use-feedback-animation";
import { MEDIA_GRID_RADIUS, type MediaFrame, type MediaGridLayout, type MediaSize } from "./media-grid-layout";
import type { MediaPageStatus } from "./media-gallery-model";

export type MediaTileStatus = "ready" | MediaPageStatus;

/** Fixed box of a message's image tiles, end-aligned like its bubble; rounded as one shape. */
export function MediaGrid({ layout, children }: { layout: MediaGridLayout; children: ReactNode }) {
  if (!layout.tiles.length) return null;
  return (
    <View style={{ alignSelf: "flex-end", width: layout.width, height: layout.height, maxWidth: "100%", borderRadius: MEDIA_GRID_RADIUS, overflow: "hidden" }}>
      {children}
    </View>
  );
}

/**
 * One image tile at its reserved frame. Every state keeps the same size: a skeleton while it loads, a
 * download glyph and size when it waits for a tap, a retry glyph after a failure. The tile of a
 * collapsed grid dims under "+N".
 */
export function MediaTile({ frame, status, uri, label, detail, overflow = 0, onPress, onLongPress, onImageError, onImageLoad }: {
  frame: MediaFrame;
  status: MediaTileStatus;
  uri?: string;
  label: string;
  /** Size of a file that waits for a download tap. */
  detail?: string;
  overflow?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  onImageError?: () => void;
  /** The decoded image's natural size, for a lone tile that keeps its aspect. */
  onImageLoad?: (size: MediaSize) => void;
}) {
  const { colors } = useMobileTheme(), copy = useCopy();
  const animate = useFeedbackAnimation();
  const revealed = useDelayedVisible(undefined, status === "loading");
  const box = { position: "absolute" as const, left: frame.left, top: frame.top, width: frame.width, height: frame.height, backgroundColor: colors.raised, overflow: "hidden" as const };
  const Glyph = status === "download" ? Download : status === "failed" ? RotateCcw : status === "too-large" ? ImageOff : ImageIcon;
  const caption = status === "download" ? detail || copy("İndir", "Download")
    : status === "failed" ? copy("Yeniden dene", "Retry")
      : status === "too-large" ? copy("Çok büyük", "Too large") : undefined;
  const content = status === "ready" && uri ? (
    <Image source={{ uri }} accessible={false} contentFit="cover" transition={animate ? 120 : 0} onError={onImageError}
      onLoad={onImageLoad ? (event) => onImageLoad({ width: event.source.width, height: event.source.height }) : undefined}
      style={{ width: "100%", height: "100%" }} />
  ) : status === "loading" ? (
    animate && revealed ? <PanelSkeleton style={{ width: "100%", height: "100%", backgroundColor: colors.raised }} /> : null
  ) : (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.xxs, padding: space.xs }}>
      <Glyph {...decorativeSvgProps} size={20} color={colors.muted} strokeWidth={1.75} />
      {caption ? <Body muted numberOfLines={1} style={{ fontSize: fontSize.caption, lineHeight: 16, fontVariant: ["tabular-nums"] }}>{caption}</Body> : null}
    </View>
  );
  const scrim = overflow > 0 ? (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, alignItems: "center", justifyContent: "center" }]}>
      <Body style={{ color: colors.viewerText, fontSize: 22, lineHeight: 28, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{`+${overflow}`}</Body>
    </View>
  ) : null;
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} accessibilityState={{ busy: status === "loading", disabled: true }} style={box}>
        {content}
        {scrim}
      </View>
    );
  }
  return (
    <PressableArea label={label} onPress={onPress} onLongPress={onLongPress} style={box}>
      {content}
      {scrim}
    </PressableArea>
  );
}
