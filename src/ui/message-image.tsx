import { useMobileTheme } from "@/ui/theme";
import { mediaQueryKey, visibleMediaData } from "./media-policy";
import { createContext, use, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { IMAGE_FRAME_MAX_HEIGHT, reservedImageRatio } from "./message-image-frame";
import { Image } from "expo-image";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Body, Button, ErrorText, Loading, PressableCard } from "./primitives";
import { useCopy } from "./copy";
import { radii, space } from "./tokens";
import { usePersistentError } from "./use-persistent-error";
import { retryTransientRead, transientRetryDelay } from "../state/query-retry";
import { externalImageUrl, type MessageContext } from "./media-policy";
import { loadProjectMedia, loadSessionMedia } from "./media-loader";
import { MediaGallery, MediaViewer, type MediaGalleryItem } from "./media-viewer";
import { inlineRaster } from "./inline-raster";
import ImageIcon from "lucide-react-native/icons/image";
import { ChatSummary } from "./chat-controls";
import { Sheet } from "./dialogs";
import { ReaderContext } from "./reader-context";
import { messageGalleryPage, messageImageKind } from "./message-image-gallery";

/**
 * One read of a message image, shared by its inline frame and the message gallery: the same key,
 * so a frame that already loaded opens in the gallery without a second download.
 */
function messageMediaQuery(context: MessageContext | undefined, source: string, attachmentId?: string, alt = "", mimeType = "image/png") {
  return {
    queryKey: mediaQueryKey(context, [
      "message-media",
      context?.machineId,
      context?.projectId,
      context?.sessionId,
      context?.cwd,
      context?.basePath,
      attachmentId,
      /^data:/i.test(source) ? "inline-raster" : source,
    ]),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      attachmentId
        ? loadSessionMedia(context!, attachmentId, alt || source, mimeType, signal)
        : loadProjectMedia(context!, source, signal),
    // A dropped link while the transcript loads retries quietly instead of marking the image failed.
    retry: retryTransientRead,
    retryDelay: transientRetryDelay,
    staleTime: Infinity,
    gcTime: 60_000,
    networkMode: "always" as const,
  };
}

type GalleryOwner = {
  open: (index: number) => void;
  /** External images the owner allowed in this message (inline "Load image" or the gallery's Download). */
  allowed: (source: string) => boolean;
  allow: (source: string) => void;
};
const MessageImageGalleryContext = createContext<GalleryOwner | null>(null);

export type MessageGalleryImage = { source: string; alt: string };

/**
 * The full-screen viewer of one message's images: tapping any image (its frame, or its "Open
 * image" row in compact transcripts) opens the zoomable lightbox on that image, and the owner pages
 * to the others with swipes and a "2 / 5" counter. Only the shown page and its neighbours read.
 */
export function MessageImageGallery({
  images,
  context,
  children,
}: {
  images: readonly MessageGalleryImage[];
  context?: MessageContext;
  children: ReactNode;
}) {
  const [opening, setOpening] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [allowedSources, setAllowedSources] = useState<ReadonlySet<string>>(() => new Set());
  const owner = useMemo<GalleryOwner>(
    () => ({
      open: (index) => {
        setPage(index);
        setOpening(index);
      },
      allowed: (source) => allowedSources.has(source),
      allow: (source) => setAllowedSources((current) => (current.has(source) ? current : new Set(current).add(source))),
    }),
    [allowedSources],
  );
  // Always the same wrapper: the first image arriving in a streaming reply must not remount the
  // message (and reset its expanded code blocks).
  return (
    <MessageImageGalleryContext value={owner}>
      {children}
      {opening !== null ? (
        <MessageGalleryViewer images={images} context={context} index={opening} page={page} owner={owner}
          onPage={setPage} onClose={() => setOpening(null)} />
      ) : null}
    </MessageImageGalleryContext>
  );
}

function MessageGalleryViewer({ images, context, index, page, owner, onPage, onClose }: {
  images: readonly MessageGalleryImage[];
  context?: MessageContext;
  index: number;
  page: number;
  owner: GalleryOwner;
  onPage: (index: number) => void;
  onClose: () => void;
}) {
  const copy = useCopy();
  const plans = useMemo(
    () => images.map((image) => {
      const external = externalImageUrl(image.source);
      const kind = messageImageKind(image.source, !!external);
      return { kind, external, raster: kind === "data" ? inlineRaster(image.source) : null };
    }),
    [images],
  );
  const queries = useQueries({
    queries: images.map((image, at) => ({
      ...messageMediaQuery(context, image.source, undefined, image.alt),
      enabled: !!context && plans[at]!.kind === "project" && Math.abs(at - page) <= 1,
    })),
  });
  const items: MediaGalleryItem[] = images.map((image, at) => {
    const plan = plans[at]!;
    const query = queries[at]!;
    const allowed = plan.kind === "external" && owner.allowed(image.source);
    const uri = plan.kind === "data" ? plan.raster?.uri
      : plan.kind === "external" ? (allowed ? plan.external ?? undefined : undefined)
        : plan.kind === "project" ? visibleMediaData(query)?.uri : undefined;
    const failed = query.isError && !query.isFetching;
    const shown = messageGalleryPage({ kind: plan.kind, uri, hasContext: !!context, allowed, failed });
    return {
      key: `${at}:${image.source}`,
      name: image.alt || copy("Resim", "Image"),
      ...shown,
      detail: shown.status === "download" && plan.external ? new URL(plan.external).hostname : undefined,
      onLoad: shown.status === "download" ? () => owner.allow(image.source)
        : shown.status === "failed" ? () => void query.refetch() : undefined,
    };
  });
  return <MediaGallery visible items={items} index={index} context={context} onIndexChange={onPage} onClose={onClose} />;
}

export function MessageImage({
  deferred = false,
  ...props
}: Parameters<typeof InlineMessageImage>[0] & { deferred?: boolean }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const gallery = use(MessageImageGalleryContext);
  const [open, setOpen] = useState(false);
  const identity = `${props.attachmentId ?? ""}:${props.source}`;
  if (!deferred) return <InlineMessageImage key={identity} {...props} />;
  const name = props.alt || copy("Resim", "Image");
  const index = props.galleryIndex;
  return (
    <>
      <ChatSummary
        label={name}
        detail={copy("Resmi aç", "Open image")}
        icon={<ImageIcon size={16} color={colors.muted} />}
        // Straight to the lightbox when the message owns a gallery; the sheet stays for lone images.
        onPress={() => (gallery && index !== undefined ? gallery.open(index) : setOpen(true))}
      />
      {gallery && index !== undefined ? null : (
        <Sheet visible={open} title={name} size="full" onClose={() => setOpen(false)}>
          {open ? <><ReaderContext context={props.context} /><InlineMessageImage key={identity} {...props} /></> : null}
        </Sheet>
      )}
    </>
  );
}

/**
 * Fixed-size frame; the spinner overlays it so finishing a load never changes the row height.
 * `framed` draws the same 12-radius hairline card the loaded image gets (the placeholder state).
 */
function ImageFrame({ ratio, loading, framed = false, children }: { ratio: number; loading: boolean; framed?: boolean; children?: ReactNode }) {
  const { colors } = useMobileTheme();
  return (
    <View
      style={[
        { width: "100%", aspectRatio: ratio, maxHeight: IMAGE_FRAME_MAX_HEIGHT },
        framed && { borderRadius: radii.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.raised },
      ]}
    >
      {children}
      {loading ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" }}
        >
          <Loading />
        </View>
      ) : null}
    </View>
  );
}

function InlineMessageImage({
  source,
  alt = "",
  context,
  attachmentId,
  mimeType = "image/png",
  localFile = false,
  onReload,
  galleryIndex,
}: {
  source: string;
  alt?: string;
  context?: MessageContext;
  attachmentId?: string;
  mimeType?: string;
  localFile?: boolean;
  onReload?: () => void;
  /** Page of this image in its message's gallery (`MessageImageGallery`); absent opens it alone. */
  galleryIndex?: number;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const gallery = use(MessageImageGalleryContext);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const external = externalImageUrl(source);
  const embedded = useMemo(() => inlineRaster(source), [source]);
  // The frame is fixed before loading: known embedded dimensions or a square, never an onLoad ratio.
  const ratio = reservedImageRatio(embedded);
  const dataSource = /^data:/i.test(source);
  const noteAsset = source.startsWith("/note-assets/");
  const [ownAllowExternal, setOwnAllowExternal] = useState(false);
  // Consent given here or in the message gallery covers both views of the same image.
  const allowExternal = ownAllowExternal || !!gallery?.allowed(source);
  const setAllowExternal = (value: boolean) => {
    setOwnAllowExternal(value);
    if (value) gallery?.allow(source);
  };
  const local = localFile && source.startsWith("file:") ? source : null;
  const query = useQuery({
    ...messageMediaQuery(context, source, attachmentId, alt, mimeType),
    enabled: !!context && !external && !local && !dataSource && !noteAsset,
  });
  const data = visibleMediaData(query);
  // A failure that heals inside the shared grace keeps the loading frame and is never reported.
  const error = usePersistentError(query.error, { hasData: data !== undefined });
  const uri = local ?? embedded?.uri ?? (external && allowExternal ? external : data?.uri);
  if (noteAsset)
    return (
      <Body muted>
        {copy(
          "Bu not resmi yalnızca bilgisayarda açılabilir.",
          "This note image is available only on your computer.",
        )}
      </Body>
    );
  if (dataSource && !embedded)
    return <Body muted>{copy("Resim kullanılamıyor", "Image unavailable")}</Body>;
  if (external && !allowExternal)
    return (
      <Button
        tone="quiet"
        label={copy("Resmi yükle: {p0}", "Load image: {p0}", {
          p0: alt || new URL(external).hostname,
        })}
        onPress={() => setAllowExternal(true)}
      />
    );
  if (!uri)
    return (
      <View style={{ gap: space.sm }}>
        {(query.isFetching || query.error) && !error ? <ImageFrame ratio={ratio} loading framed /> : null}
        <ErrorText error={error} />
        {error ? (
          <Button busy={query.isFetching}
            label={copy("Resmi yeniden yükle", "Retry image")}
            onPress={() => {
              void query.refetch();
            }}
          />
        ) : !context ? (
          <Body muted>{alt || copy("Resim kullanılamıyor", "Image unavailable")}</Body>
        ) : null}
      </View>
    );
  return (
    <View style={{ gap: space.xs }}>
      <PressableCard
        label={copy("Resmi aç: {p0}", "Open image: {p0}", {
          p0: alt || (embedded ? copy("Resim", "Image") : source),
        })}
        onPress={() => (gallery && galleryIndex !== undefined ? gallery.open(galleryIndex) : setOpen(true))}
        style={{
          padding: 0,
          // Clips only the frame corners; the image is fitted (contain), never cropped.
          overflow: "hidden",
          borderRadius: radii.card,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.raised,
        }}
      >
        <ImageFrame ratio={ratio} loading={!loaded && !error}>
          <Image
            key={attempt}
            source={{ uri }}
            accessibilityLabel={alt}
            contentFit="contain"
            transition={0}
            style={{ width: "100%", height: "100%" }}
            onLoad={() => {
              setLoaded(true);
              setFailed(false);
            }}
            onError={() => {
              setFailed(true);
              setLoaded(true);
            }}
          />
        </ImageFrame>
      </PressableCard>
      <ErrorText error={error} />
      {failed || error ? (
        <Button
          busy={!loaded || query.isFetching}
          label={copy("Resmi yeniden yükle", "Retry image")}
          onPress={() => {
            setFailed(false);
            setLoaded(false);
            if (onReload) onReload();
            // A web image never had a computer read: its query is disabled, and forcing it would ask
            // the computer for an https "file". Remounting the image retries the web request itself.
            else if (context && !embedded && !external && !local) void query.refetch();
            else setAttempt(attempt + 1);
          }}
        />
      ) : null}
      {open ? (
        <MediaViewer
          uri={uri}
          name={alt || copy("Resim", "Image")}
          visible
          context={context}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}
