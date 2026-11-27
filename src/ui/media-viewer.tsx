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
import { Body, IconButton, StatusLine } from "./primitives";
import { TextAction } from "./status-line";
import { BusyIndicator } from "./busy-glyph";
import { errorMessage } from "./error-message";
import { ScreenOverlay } from "./overlays";
import { useMediaSharing } from "./use-media-sharing";
import { useCopy } from "./copy";
import { metrics, radii, space } from "./tokens";
import type { MessageContext } from "./media-policy";
import { ReaderContext } from "./reader-context";
import { useRotatableScreen } from "./media-orientation";
import { useSaveToPhotos } from "./media-save";
import { MediaCropOverlay } from "./media-crop-overlay";
import { clampPan, panLimits } from "./media-viewer-pan";
import { useReducedMotionPreference } from "./use-reduced-motion";
import {
  clampGalleryIndex, galleryAxis, galleryCounter, galleryDragOffset, galleryWindow, settleGalleryPage,
  GALLERY_DISMISS, GALLERY_IDLE, GALLERY_PAGE, GALLERY_ZOOM, type MediaPageStatus,
} from "./media-gallery-model";

/** A downward drag this far (or a fast flick) at normal zoom closes the viewer. */
export const DRAG_CLOSE_DISTANCE = 120;
const DRAG_CLOSE_VELOCITY = 900;
const PAGE_SETTLE_MS = 220;

/** One bottom line for the viewer: a failed preview first (with Retry), then the latest action result. */
export function mediaViewerStatus(state: { preview: unknown; copy: unknown; share: unknown; save: unknown; copied: boolean }):
  { kind: "preview" | "action"; error: unknown } | { kind: "copied" } | null {
  if (state.preview) return { kind: "preview", error: state.preview };
  const failure = state.copy ?? state.share ?? state.save;
  if (failure) return { kind: "action", error: failure };
  return state.copied ? { kind: "copied" } : null;
}

type ReferenceHandler = (file: { uri: string; name: string }) => void;

/** One page of a gallery. Without a `uri` the page explains why and may offer `onLoad` (download or retry). */
export type MediaGalleryItem = {
  key: string;
  name: string;
  uri?: string;
  status?: MediaPageStatus;
  /** Size of a file that waits for a download. */
  detail?: string;
  onLoad?: () => void;
  /** Hands the local file to the composer as a reference; omitted when the host screen cannot attach. */
  onUseAsReference?: ReferenceHandler;
};

type MediaViewerProps = { uri: string; name: string; visible: boolean; onClose: () => void; context?: MessageContext;
  /** Hands the local file to the composer as a reference; omitted when the host screen cannot attach. */
  onUseAsReference?: ReferenceHandler };

type MediaGalleryProps = { items: readonly MediaGalleryItem[]; index: number; visible: boolean; onClose: () => void; context?: MessageContext;
  /** The page on screen, so the owner can read that page and its neighbours only. */
  onIndexChange?: (index: number) => void };

/** Each opening is a fresh owner of zoom, page and error state, so reopening remounts the body. */
function useOpeningCount(visible: boolean) {
  const [opening, setOpening] = useState({ visible, count: 0 });
  let count = opening.count;
  if (visible !== opening.visible) {
    count = visible ? opening.count + 1 : opening.count;
    setOpening({ visible, count });
  }
  return count;
}

/** Zoom and error state belong to one image and one opening, so a new uri or reopening remounts the body. */
export function MediaViewer({ uri, name, visible, onClose, context, onUseAsReference }: MediaViewerProps) {
  const count = useOpeningCount(visible);
  return <MediaGalleryBody key={`${count}:${uri}`} items={[{ key: uri, name, uri, onUseAsReference }]} index={0} visible={visible} onClose={onClose} context={context} />;
}

/**
 * The full-screen viewer paging horizontally through a message's images, starting at the tapped one,
 * with a "3 / 7" counter. Paging locks while an image is zoomed, so pinch and pan never turn the page.
 */
export function MediaGallery(props: MediaGalleryProps) {
  const count = useOpeningCount(props.visible);
  return <MediaGalleryBody key={count} {...props} />;
}

type Size = { width: number; height: number };

function MediaGalleryBody({ items, index: initial, visible, onClose, context, onIndexChange }: MediaGalleryProps) {
  const { colors } = useMobileTheme();
  useRotatableScreen(visible);
  const insets = useSafeAreaInsets();
  const copy = useCopy();
  const reduced = useReducedMotionPreference();
  const count = items.length;
  const [index, setIndex] = useState(() => clampGalleryIndex(initial, count));
  const current = clampGalleryIndex(index, count);
  const item = items[current];
  // A crop result replaces the shown file; share, save, copy and reference all follow it.
  const [cropped, setCropped] = useState<Record<string, string>>({});
  const pageUri = (page: MediaGalleryItem) => (page.uri ? cropped[`${page.key}|${page.uri}`] ?? page.uri : undefined);
  const uri = item ? pageUri(item) : undefined;
  const pageId = item && uri ? `${item.key}|${uri}` : "";
  const name = item?.name ?? "";
  const [cropping, setCropping] = useState(false);
  const [dimensions, setDimensions] = useState<Record<string, Size>>({});
  const [errors, setErrors] = useState<Record<string, unknown>>({});
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const imageOwner = useRef({ visible, attempts }); imageOwner.current = { visible, attempts };
  const local = !!uri && uri.startsWith("file:");
  const sharing = useMediaSharing({ uri, name, enabled: visible && local });
  const photos = useSaveToPhotos(uri ?? "", visible && local);
  const [copied, setCopied] = useState<unknown>(null);
  const [copiedDone, setCopiedDone] = useState(false);
  useEffect(() => {
    if (!copiedDone) return;
    const timer = setTimeout(() => setCopiedDone(false), 2000);
    return () => clearTimeout(timer);
  }, [copiedDone]);
  // Action feedback belongs to the page it came from.
  useEffect(() => { setCopied(null); setCopiedDone(false); }, [pageId]);
  const copyImage = async () => {
    if (!uri) return;
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
  const [width, setWidth] = useState(0);
  const page = useSharedValue(current); const pages = useSharedValue(count); const pageWidth = useSharedValue(0);
  const track = useSharedValue(0); const mode = useSharedValue(GALLERY_IDLE); const settleMs = useSharedValue(reduced ? 0 : PAGE_SETTLE_MS);
  useEffect(() => { pages.value = count; settleMs.value = reduced ? 0 : PAGE_SETTLE_MS; }, [count, reduced]);
  const resetZoom = () => { scale.value = 1; saved.value = 1; x.value = 0; y.value = 0; originX.value = 0; originY.value = 0; };
  // A new page brings its own natural size for pan limits; zoom never carries across pages.
  useEffect(() => { natural.value = dimensions[pageId] ?? { width: 0, height: 0 }; }, [pageId, dimensions[pageId]]);
  // Fewer items (a message lost an image) clamp the page; the track and gesture page follow it.
  useEffect(() => {
    if (index === current) return;
    resetZoom(); page.value = current; track.value = -current * pageWidth.value; setCropping(false); setIndex(current);
  }, [index, current]);
  const pageChange = useRef(onIndexChange); pageChange.current = onIndexChange;
  useEffect(() => { pageChange.current?.(current); }, [current]);
  const goTo = (next: number) => {
    const target = clampGalleryIndex(next, count);
    resetZoom(); page.value = target; track.value = withTiming(-target * pageWidth.value, { duration: reduced ? 0 : PAGE_SETTLE_MS });
    setCropping(false); setIndex(target);
  };
  // Paging only at normal zoom; once a pinch starts on a page the page stays put.
  const pinch = Gesture.Pinch().onUpdate((event) => {
    if (mode.value === GALLERY_PAGE) return;
    scale.value = Math.min(5, Math.max(1, saved.value * event.scale)); const limit = panLimits(viewport.value, natural.value, scale.value); x.value = clampPan(x.value, limit.x); y.value = clampPan(y.value, limit.y);
  }).onEnd(() => { if (mode.value === GALLERY_PAGE) return; saved.value = scale.value; if (scale.value === 1) { x.value = 0; y.value = 0; } originX.value = x.value; originY.value = y.value; });
  // At normal zoom a sideways drag pages and a downward drag follows the finger and closes the viewer; zoomed, it pans.
  const pan = Gesture.Pan().onStart(() => { mode.value = scale.value > 1 ? GALLERY_ZOOM : GALLERY_IDLE; }).onUpdate((event) => {
    if (scale.value > 1 && mode.value !== GALLERY_PAGE) mode.value = GALLERY_ZOOM;
    if (mode.value === GALLERY_ZOOM) { const limit = panLimits(viewport.value, natural.value, scale.value); x.value = clampPan(originX.value + event.translationX, limit.x); y.value = clampPan(originY.value + event.translationY, limit.y); return; }
    if (mode.value === GALLERY_IDLE) mode.value = galleryAxis(event.translationX, event.translationY, pages.value > 1);
    if (mode.value === GALLERY_PAGE) track.value = galleryDragOffset(page.value, pages.value, event.translationX, pageWidth.value);
    else if (mode.value === GALLERY_DISMISS) y.value = Math.max(0, event.translationY);
  }).onEnd((event, success) => {
    // A cancelled drag neither turns the page nor closes; onFinalize puts everything back.
    if (!success) return;
    const ended = mode.value; mode.value = GALLERY_IDLE;
    if (ended === GALLERY_ZOOM) { originX.value = x.value; originY.value = y.value; return; }
    if (ended === GALLERY_PAGE) {
      const target = settleGalleryPage(page.value, pages.value, event.translationX, event.velocityX, pageWidth.value);
      track.value = withTiming(-target * pageWidth.value, { duration: settleMs.value });
      if (target !== page.value) { page.value = target; scheduleOnRN(setIndex, target); }
      return;
    }
    if (event.translationY > DRAG_CLOSE_DISTANCE || event.velocityY > DRAG_CLOSE_VELOCITY) scheduleOnRN(onClose);
    else y.value = withTiming(0, { duration: 160 });
  }).onFinalize(() => {
    const ended = mode.value;
    if (ended === GALLERY_IDLE) return;
    mode.value = GALLERY_IDLE;
    if (ended === GALLERY_ZOOM) { originX.value = x.value; originY.value = y.value; return; }
    if (ended === GALLERY_PAGE) track.value = withTiming(-page.value * pageWidth.value, { duration: settleMs.value });
    else y.value = withTiming(0, { duration: 160 });
  });
  const tap = Gesture.Tap().numberOfTaps(2).onEnd(() => { scale.value = scale.value > 1 ? 1 : 2.5; saved.value = scale.value; x.value = 0; y.value = 0; originX.value = 0; originY.value = 0; });
  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  const trackStyle = useAnimatedStyle(() => ({ transform: [{ translateX: track.value }] }));
  const icon = (Glyph: typeof X) => <Glyph size={22} color={colors.viewerText} />;
  const status = mediaViewerStatus({ preview: errors[pageId], copy: copied, share: sharing.error, save: photos.error, copied: copiedDone });
  const counter = galleryCounter(current, count);
  const size = dimensions[pageId];
  const retryPreview = () => {
    if (!pageId) return;
    setErrors(value => ({ ...value, [pageId]: null }));
    setAttempts(value => ({ ...value, [pageId]: (value[pageId] ?? 0) + 1 }));
  };
  const applyCrop = (result: string) => {
    if (!item?.uri) return;
    resetZoom(); natural.value = { width: 0, height: 0 };
    setCropped(value => ({ ...value, [`${item.key}|${item.uri}`]: result })); setCropping(false);
  };
  if (cropping && uri && size) return <ScreenOverlay visible={visible} label={name} onClose={() => setCropping(false)}>
    <MediaCropOverlay uri={uri} name={name} width={size.width} height={size.height} onCancel={() => setCropping(false)} onApply={applyCrop} />
  </ScreenOverlay>;
  const renderPage = (at: number) => {
    const entry = items[at]!;
    const source = pageUri(entry);
    const id = source ? `${entry.key}|${source}` : "";
    const attempt = attempts[id] ?? 0;
    const placement = { position: "absolute" as const, top: 0, bottom: 0, left: width ? at * width : 0, width: width || "100%" as const };
    const body = source ? (
      <Image key={attempt} source={{ uri: source }} accessibilityLabel={entry.name} contentFit="contain"
        onLoad={(event) => {
          const next = { width: event.source.width, height: event.source.height };
          if (at === current) natural.value = next;
          setDimensions(value => ({ ...value, [id]: next }));
        }}
        onError={() => {
          if (imageOwner.current.visible && (imageOwner.current.attempts[id] ?? 0) === attempt)
            setErrors(value => ({ ...value, [id]: new Error(copy("Önizleme açılamadı.", "Preview could not be opened.")) }));
        }} style={{ flex: 1 }} />
    ) : <MediaPagePlaceholder item={entry} />;
    // One element type for every page, so a page turn never remounts (and reloads) its image.
    return <Animated.View key={entry.key} style={at === current ? [placement, zoomStyle] : placement}>{body}</Animated.View>;
  };
  return <ScreenOverlay visible={visible} label={name} onClose={onClose}>
    <ReaderContext context={context} bounded />
    <View style={{ flex: 1, backgroundColor: colors.viewer }}>
      {/* The pages stay plain containers, so a screen reader reaches each image and its Download or Retry. */}
      <View
        style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
        onLayout={(event) => {
          const { width: w, height: h } = event.nativeEvent.layout;
          viewport.value = { width: w, height: h }; pageWidth.value = w; track.value = -page.value * w; setWidth(w);
        }}
      >
        <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, tap)}>
          <Animated.View style={[{ flex: 1 }, trackStyle]}>
            {(width ? galleryWindow(current, count) : item ? [current] : []).map(renderPage)}
          </Animated.View>
        </GestureDetector>
      </View>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top, paddingHorizontal: Math.max(space.sm, insets.left), flexDirection: "row", alignItems: "center", gap: space.xs, backgroundColor: colors.scrim }}>
        <View style={{ flex: 1, minWidth: 0, paddingStart: space.sm }}>
          {/* The counter is the gallery's adjustable control: swipe up or down on it to turn the page. */}
          {counter ? (
            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={copy("Resimler", "Images")}
              accessibilityValue={{ text: counter }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(event) => goTo(current + (event.nativeEvent.actionName === "increment" ? 1 : -1))}
              style={{ alignSelf: "flex-start", minHeight: metrics.visualControl, justifyContent: "center" }}
            >
              <Body accessibilityLiveRegion="polite" style={{ color: colors.viewerText, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{counter}</Body>
            </View>
          ) : null}
        </View>
        {local && size ? <IconButton label={copy("Kırp", "Crop")} onPress={() => setCropping(true)}>{icon(CropIcon)}</IconButton> : null}
        {local ? <IconButton label={copy("Fotoğraflara kaydet", "Save to Photos")} busy={photos.busy} onPress={() => { void photos.save(); }}>{icon(Download)}</IconButton> : null}
        {local ? <IconButton label={copy("Paylaş", "Share")} busy={sharing.busy} onPress={sharing.share}>{icon(Share2)}</IconButton> : null}
        {local ? <IconButton label={copy("Kopyala", "Copy")} onPress={() => { void copyImage(); }}>{icon(CopyIcon)}</IconButton> : null}
        {local && uri && item?.onUseAsReference ? <IconButton label={copy("Referans olarak kullan", "Use as reference")} onPress={() => { item.onUseAsReference!({ uri, name }); onClose(); }}>{icon(Paperclip)}</IconButton> : null}
        {/* Same place and shape as a sheet's Close: top end, in a filled circle. */}
        <IconButton label={copy("Kapat", "Close")} onPress={onClose}>
          <View style={{ width: metrics.visualControl, height: metrics.visualControl, borderRadius: radii.pill, backgroundColor: colors.viewerControl, alignItems: "center", justifyContent: "center" }}>
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
                  action={status.kind === "preview" ? { label: copy("Yeniden dene", "Retry"), onPress: retryPreview } : undefined} />}
          </View>
        ) : null}
      </View>
    </View>
  </ScreenOverlay>;
}

/** A page whose image is not on the device: loading, waiting for a download, failed or unavailable. */
function MediaPagePlaceholder({ item }: { item: MediaGalleryItem }) {
  const { colors } = useMobileTheme(), copy = useCopy();
  const status = item.status ?? "unavailable";
  const message = status === "loading" ? copy("Yükleniyor…", "Loading…")
    : status === "download" ? [item.detail, copy("İndirildiğinde burada görünür.", "Appears here once downloaded.")].filter(Boolean).join(" · ")
      : status === "failed" ? copy("Önizleme açılamadı.", "Preview could not be opened.")
        : status === "too-large" ? copy("Çok büyük", "Too large")
          : copy("Önizleme kullanılamıyor.", "Preview unavailable.");
  const action = status === "download" ? copy("İndir", "Download") : status === "failed" ? copy("Yeniden dene", "Retry") : undefined;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, paddingHorizontal: space.screen }}>
      {status === "loading" ? <BusyIndicator color={colors.viewerText} label={message} /> : null}
      <Body style={{ color: colors.viewerText, textAlign: "center" }}>{message}</Body>
      {action && item.onLoad ? <TextAction label={action} color={colors.viewerText} onPress={item.onLoad} /> : null}
    </View>
  );
}
