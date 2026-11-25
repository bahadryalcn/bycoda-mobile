import { useMobileTheme } from "@/ui/theme";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { File } from "expo-file-system";
import * as Clipboard from "expo-clipboard";
import { MAX_COPY_IMAGE_BYTES } from "./media-inline-policy";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import X from "lucide-react-native/icons/x";
import Share2 from "lucide-react-native/icons/share-2";
import CopyIcon from "lucide-react-native/icons/copy";
import Paperclip from "lucide-react-native/icons/paperclip";
import Download from "lucide-react-native/icons/download";
import CropIcon from "lucide-react-native/icons/crop";
import { IconButton, StatusLine } from "./primitives";
import { errorMessage } from "./error-message";
import { ScreenOverlay } from "./overlays";
import { useMediaSharing } from "./use-media-sharing";
import { useCopy } from "./copy";
import { radii, space } from "./tokens";
import type { MessageContext } from "./media-policy";
import { ReaderContext } from "./reader-context";
import { useRotatableScreen } from "./media-orientation";
import { useSaveToPhotos } from "./media-save";
import { MediaCropOverlay } from "./media-crop-overlay";
import { clampPan, panLimits } from "./media-viewer-pan";

/** A downward drag this far (or a fast flick) at normal zoom closes the viewer. */
export const DRAG_CLOSE_DISTANCE = 120;
const DRAG_CLOSE_VELOCITY = 900;

/** One bottom line for the viewer: a failed preview first (with Retry), then the latest action result. */
export function mediaViewerStatus(state: { preview: unknown; copy: unknown; share: unknown; save: unknown; copied: boolean }):
  { kind: "preview" | "action"; error: unknown } | { kind: "copied" } | null {
  if (state.preview) return { kind: "preview", error: state.preview };
  const failure = state.copy ?? state.share ?? state.save;
  if (failure) return { kind: "action", error: failure };
  return state.copied ? { kind: "copied" } : null;
}

type MediaViewerProps = { uri: string; name: string; visible: boolean; onClose: () => void; context?: MessageContext;
  /** Hands the local file to the composer as a reference; omitted when the host screen cannot attach. */
  onUseAsReference?: (file: { uri: string; name: string }) => void };

/** Zoom and error state belong to one image and one opening, so a new uri or reopening remounts the body. */
export function MediaViewer(props: MediaViewerProps) {
  const [opening, setOpening] = useState({ visible: props.visible, count: 0 });
  let count = opening.count;
  if (props.visible !== opening.visible) {
    count = props.visible ? opening.count + 1 : opening.count;
    setOpening({ visible: props.visible, count });
  }
  return <MediaViewerBody key={`${count}:${props.uri}`} {...props} />;
}

function MediaViewerBody({ uri: original, name, visible, onClose, context, onUseAsReference }: MediaViewerProps) {
  const { colors } = useMobileTheme();
  useRotatableScreen(visible);
  // A crop result replaces the shown file; share, save, copy and reference all follow it.
  const [uri, setUri] = useState(original);
  const [cropping, setCropping] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const insets = useSafeAreaInsets();
  const copy = useCopy();
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const imageOwner = useRef({ visible, attempt }); imageOwner.current = { visible, attempt };
  const local = uri.startsWith("file:");
  const sharing = useMediaSharing({ uri, name, enabled: visible && local });
  const photos = useSaveToPhotos(uri, visible && local);
  const [copied, setCopied] = useState<unknown>(null);
  const [copiedDone, setCopiedDone] = useState(false);
  useEffect(() => {
    if (!copiedDone) return;
    const timer = setTimeout(() => setCopiedDone(false), 2000);
    return () => clearTimeout(timer);
  }, [copiedDone]);
  const copyImage = async () => {
    try {
      const file = new File(uri);
      if (file.size > MAX_COPY_IMAGE_BYTES) throw new Error(copy("Resim kopyalanamayacak kadar büyük.", "The image is too large to copy."));
      await Clipboard.setImageAsync(await file.base64()); setCopied(null); setCopiedDone(true);
    } catch (error) { setCopied(error); }
  };
  const scale = useSharedValue(1); const saved = useSharedValue(1);
  const x = useSharedValue(0); const y = useSharedValue(0); const originX = useSharedValue(0); const originY = useSharedValue(0);
  // Pan limits keep the scaled image's edges on screen, so a zoomed photo cannot be dragged out of view.
  const viewport = useSharedValue({ width: 0, height: 0 }); const natural = useSharedValue({ width: 0, height: 0 });
  const pinch = Gesture.Pinch().onUpdate((event) => { scale.value = Math.min(5, Math.max(1, saved.value * event.scale)); const limit = panLimits(viewport.value, natural.value, scale.value); x.value = clampPan(x.value, limit.x); y.value = clampPan(y.value, limit.y); }).onEnd(() => { saved.value = scale.value; if (scale.value === 1) { x.value = 0; y.value = 0; } originX.value = x.value; originY.value = y.value; });
  // At normal zoom a downward drag follows the finger and closes the viewer; zoomed, it pans.
  const pan = Gesture.Pan().onUpdate((event) => { if (scale.value > 1) { const limit = panLimits(viewport.value, natural.value, scale.value); x.value = clampPan(originX.value + event.translationX, limit.x); y.value = clampPan(originY.value + event.translationY, limit.y); } else y.value = Math.max(0, event.translationY); }).onEnd((event) => {
    if (scale.value <= 1) {
      if (event.translationY > DRAG_CLOSE_DISTANCE || event.velocityY > DRAG_CLOSE_VELOCITY) scheduleOnRN(onClose);
      else y.value = withTiming(0, { duration: 160 });
      return;
    }
    originX.value = x.value; originY.value = y.value;
  });
  const tap = Gesture.Tap().numberOfTaps(2).onEnd(() => { scale.value = scale.value > 1 ? 1 : 2.5; saved.value = scale.value; x.value = 0; y.value = 0; originX.value = 0; originY.value = 0; });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  const icon = (Glyph: typeof X) => <Glyph size={22} color={colors.viewerText} />;
  const status = mediaViewerStatus({ preview: previewError, copy: copied, share: sharing.error, save: photos.error, copied: copiedDone });
  const applyCrop = (cropped: string) => {
    scale.value = 1; saved.value = 1; x.value = 0; y.value = 0; originX.value = 0; originY.value = 0; natural.value = { width: 0, height: 0 };
    setPreviewError(null); setDimensions(null); setUri(cropped); setCropping(false);
  };
  if (cropping && dimensions) return <ScreenOverlay visible={visible} label={name} onClose={() => setCropping(false)}>
    <MediaCropOverlay uri={uri} name={name} width={dimensions.width} height={dimensions.height} onCancel={() => setCropping(false)} onApply={applyCrop} />
  </ScreenOverlay>;
  return <ScreenOverlay visible={visible} label={name} onClose={onClose}>
    <ReaderContext context={context} bounded />
    <View style={{ flex: 1, backgroundColor: colors.viewer }}>
      <View style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, tap)}><Animated.View style={[{ flex: 1 }, style]} onLayout={(event) => { viewport.value = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height }; }}><Image key={attempt} source={{ uri }} accessibilityLabel={name} contentFit="contain" onLoad={(event) => { natural.value = { width: event.source.width, height: event.source.height }; setDimensions({ width: event.source.width, height: event.source.height }); }} onError={() => { if (imageOwner.current.visible && imageOwner.current.attempt === attempt) setPreviewError(new Error(copy("Önizleme açılamadı.", "Preview could not be opened."))); }} style={{ flex: 1 }} /></Animated.View></GestureDetector>
      </View>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top, paddingHorizontal: Math.max(space.sm, insets.left), flexDirection: "row", alignItems: "center", gap: space.xs, backgroundColor: colors.scrim }}>
        <View style={{ flex: 1 }} />
        {local && dimensions ? <IconButton label={copy("Kırp", "Crop")} onPress={() => setCropping(true)}>{icon(CropIcon)}</IconButton> : null}
        {local ? <IconButton label={copy("Fotoğraflara kaydet", "Save to Photos")} busy={photos.busy} onPress={() => { void photos.save(); }}>{icon(Download)}</IconButton> : null}
        {local ? <IconButton label={copy("Paylaş", "Share")} busy={sharing.busy} onPress={sharing.share}>{icon(Share2)}</IconButton> : null}
        {local ? <IconButton label={copy("Kopyala", "Copy")} onPress={() => { void copyImage(); }}>{icon(CopyIcon)}</IconButton> : null}
        {local && onUseAsReference ? <IconButton label={copy("Referans olarak kullan", "Use as reference")} onPress={() => { onUseAsReference({ uri, name }); onClose(); }}>{icon(Paperclip)}</IconButton> : null}
        {/* Same place and shape as a sheet's Close: top end, in a filled circle. */}
        <IconButton label={copy("Kapat", "Close")} onPress={onClose}>
          <View style={{ width: 30, height: 30, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" }}>
            <X size={16} strokeWidth={2.6} color={colors.viewerText} />
          </View>
        </IconButton>
      </View>
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: insets.bottom + space.sm, paddingHorizontal: space.screen, gap: space.xs, alignItems: "center" }}>
        {status ? (
          <View style={{ backgroundColor: colors.scrim, borderRadius: radii.pill, paddingHorizontal: space.md, paddingVertical: space.xs, maxWidth: "100%" }}>
            {status.kind === "copied"
              ? <StatusLine tone="success" color={colors.viewerText} label={copy("Kopyalandı", "Copied")} />
              : <StatusLine tone="danger" color={colors.viewerText} label={errorMessage(status.error, copy)}
                  action={status.kind === "preview" ? { label: copy("Yeniden dene", "Retry"), onPress: () => { setPreviewError(null); setAttempt(value => value + 1); } } : undefined} />}
          </View>
        ) : null}
      </View>
    </View>
  </ScreenOverlay>;
}
