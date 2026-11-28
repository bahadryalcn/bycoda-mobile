import { useMobileTheme } from "@/ui/theme";
import { mediaQueryKey } from "@/ui/media-policy";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { ErrorText, FormActions, Loading, Sheet } from "@/ui/primitives";
import { AttachmentPreview, confirmDownload, useSessionFile } from "./transcript-attachment-preview";
import { attachmentKind, attachmentPlan, formatAttachmentSize } from "@/ui/media-inline-policy";
import { DocumentPreview } from "@/ui/document-preview";
import type { LoadedMedia } from "@/ui/media-loader";
import type { MessageContext } from "@/ui/media-policy";
import { useCopy } from "@/ui/copy";
import { useHostClient, useHostReadActive } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { useDataSaverActive } from "@/state/data-saver";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { useReaderContentAccess, useReaderRetry, useReaderScope } from "@/ui/use-reader-scope";
import { space } from "@/ui/tokens";
import { loopbackScopeKey } from "@/ui/loopback-link";
import { FileChip } from "@/ui/file-chip";
import { isPastedTextAttachment } from "./transcript-labels-model";
import { MediaGrid, MediaTile, type MediaTileStatus } from "@/ui/media-grid";
import { MEDIA_GRID_SLOTS, mediaGridLayout, rememberedMediaSize, rememberMediaSize, type MediaFrame, type MediaSize } from "@/ui/media-grid-layout";
import { MediaGallery, type MediaGalleryItem } from "@/ui/media-viewer";
import { mediaAutoLoads, type MediaPageStatus } from "@/ui/media-gallery-model";
import type { Block } from "./wire";
import { ReaderContext } from "@/ui/reader-context";
import { RecordAccessUnavailable } from "./unavailable-state";
import { ComposerLinks } from "./composer-links";
import { composerLinks } from "./attachment-presentation";
import { appendToDraft } from "./draft-append";
import type { StagedAttachment } from "./attachment-model";

/**
 * The explicit opening owner of one attachment's reader. A changed file, transport or context retires
 * the old opening instead of opening the new target.
 */
function useAttachmentOpening(context: MessageContext, id: string, name: string, mimeType?: string) {
  const active = useHostReadActive();
  const access = usePrivateContentAccess(),
    mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const key = JSON.stringify(mediaQueryKey(context, ["attachment-preview", id, name, mimeType]));
  const identity = useMemo(() => ({}), [key, context.client]);
  const review = useMemo(() => reviewedMachine(context.client.machine), [identity]);
  const [selection, setSelection] = useState<object | null>(null);
  const intent = useMemo(() => ({}), [identity, selection, active, access.allowed]);
  const live = useRef({ identity, selection, intent, active, access });
  live.current = { identity, selection, intent, active, access };
  const open = () => {
    if (
      !mounted.current ||
      live.current.identity !== identity ||
      live.current.intent !== intent ||
      live.current.selection === identity ||
      context.machineId !== review?.id ||
      !live.current.active ||
      !live.current.access.allowed ||
      !live.current.access.check() ||
      !isReviewedMachine(review, useMachines.getState())
    )
      return;
    live.current.selection = identity;
    setSelection(identity);
  };
  const close = () => {
    if (
      mounted.current &&
      live.current.identity === identity &&
      live.current.selection === identity
    ) {
      live.current.selection = null;
      setSelection(null);
    }
  };
  return { key, open, close, opened: selection === identity, available: active && access.allowed };
}

export function AttachmentFile({
  id,
  name,
  size,
  mimeType,
  image,
  context,
}: {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  image: boolean;
  context: MessageContext;
}) {
  const opening = useAttachmentOpening(context, id, name, mimeType);
  return (
    <>
      <AttachmentPreview
        key={opening.key}
        id={id}
        name={name}
        size={size}
        mimeType={mimeType}
        kind={attachmentKind(name, mimeType, image)}
        context={context}
        onOpenFile={opening.open}
      />
      {opening.opened ? (
        <AttachmentReader
          id={id}
          name={name}
          mimeType={mimeType}
          context={context}
          onClose={opening.close}
        />
      ) : null}
    </>
  );
}

/** One explicit opening owns reads, callbacks, and all descendant previews. */
function AttachmentReader({
  id,
  name,
  mimeType,
  context,
  onClose,
}: {
  id: string;
  name: string;
  mimeType?: string;
  context: MessageContext;
  onClose(): void;
}) {
  const copy = useCopy(),
    scope = useReaderScope(context, id);
  const { ready, available } = scope;
  const { query, data } = useSessionFile(scope, context, id, name, mimeType, true);
  const content = useReaderContentAccess(
    scope,
    data ? JSON.stringify([data.uri, data.name, data.mimeType]) : undefined,
    available && !!data,
  );
  const { retry, retryError } = useReaderRetry(scope, query);
  const close = () => scope.close(onClose);
  const reloadContent = () => {
    if (content.check()) retry();
  };
  return (
    <Sheet
      visible
      title={name}
      size="full"
      onClose={close}
      footer={
        available && query.error ? (
          <FormActions
            submitLabel={copy("Dosyayı yeniden yükle", "Retry file")}
            onSubmit={retryError}
            busy={query.isFetching}
            feedback={<ErrorText error={query.error} />}
            cancelLabel={copy("Kapat", "Close")}
            onCancel={close}
            allowCancelWhileBusy
          />
        ) : (
          <FormActions tone="quiet" submitLabel={copy("Kapat", "Close")} onSubmit={close} />
        )
      }
    >
      {/* A refetch keeps the shown file; only a first read shows progress. */}
      {!ready || (available && query.isFetching && !query.error && !data) ? <Loading delayed /> : null}
      {!available && ready ? <RecordAccessUnavailable /> : null}
      {available ? (
        <>
          {data ? (
            <PrivateContentAccessProvider value={content.access}>
              <ScopedAttachmentContent data={data} context={context} onReload={reloadContent} />
            </PrivateContentAccessProvider>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

function ScopedAttachmentContent({
  data,
  context,
  onReload,
}: {
  data: LoadedMedia;
  context: MessageContext;
  onReload(): void;
}) {
  const client = useHostClient();
  return client ? (
    <>
      <ReaderContext context={context} />
      <DocumentPreview {...data} context={{ ...context, client }} onReload={onReload} />
    </>
  ) : null;
}
type MessageFile = { id: string; name: string; size?: number; mimeType?: string; image: boolean };

function messageFiles(block: Block): MessageFile[] {
  return [
    ...(block.image
      ? [
          {
            id: block.id,
            name: block.image.name,
            size: block.image.size,
            mimeType: block.image.mimeType,
            image: true,
          },
        ]
      : []),
    ...(block.attachments ?? []).map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      mimeType: file.mimeType,
      image: file.kind === "image",
    })),
  ];
}

/** Whether a user message carries files, which render above its bubble rather than inside it. */
export function hasUserMessageAttachments(block: Block) {
  return block.role === "user" && (!!block.image || !!block.attachments?.length);
}

/**
 * In-bubble extras: a user message keeps only its link chips here (its files sit above the bubble in
 * UserMessageAttachments); other roles keep their attachment previews inside the message.
 */
export function TranscriptAttachments({
  block,
  context,
}: {
  block: Block;
  context?: MessageContext;
}) {
  useMobileTheme();
  const sent = block.role === "user";
  const links = useMemo(() => (sent ? composerLinks(block.text ?? "") : []), [sent, block.text]);
  const files = sent ? [] : messageFiles(block);
  if (!context || (!files.length && !links.length)) return null;
  return (
    <View style={{ gap: space.xs }}>
      {files.map((file) => <AttachmentFile key={file.id} {...file} context={context} />)}
      {links.length ? <ComposerLinks links={links} ownerScope={loopbackScopeKey(context)} /> : null}
    </View>
  );
}

/** The user column is 85% of the transcript; the media box never grows past it. */
const USER_COLUMN = 0.85;
const ColumnWidth = createContext<number | undefined>(undefined);

/**
 * Measures the transcript column a user message (or its outbox copy) sits in, full width, so its media
 * follows split panes and tablets instead of the window. It only stretches; the row inside keeps its
 * own end alignment and 85% cap.
 */
export function UserMediaColumn({ measure = true, style, children }: { measure?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const [width, setWidth] = useState<number>();
  if (!measure) return <>{children}</>;
  return (
    <View
      style={[{ alignSelf: "stretch" }, style]}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
    >
      <ColumnWidth.Provider value={width}>{children}</ColumnWidth.Provider>
    </View>
  );
}

/** Until the column is measured the window estimate stands in; on phones both reach the 280dp cap. */
function useUserMediaWidth() {
  const measured = useContext(ColumnWidth);
  const { width } = useWindowDimensions();
  return Math.floor((measured ?? width - space.screen * 2) * USER_COLUMN);
}

/**
 * A lone image's natural size: known at once from an earlier load under the same key, else learned from
 * its first load (one settle from the 4:3 frame, never again for that key).
 */
function useNaturalSize(key: string | undefined) {
  const [, learned] = useState(0);
  const natural = rememberedMediaSize(key);
  const onLoad = useCallback((size: MediaSize) => {
    if (key && rememberMediaSize(key, size)) learned((value) => value + 1);
  }, [key]);
  return { natural, onLoad };
}

type ReferenceHandler = (file: { uri: string; name: string }) => void;
type SlotReport = { status: MediaTileStatus; uri?: string };
type SlotActions = { load?: () => void; useAsReference?: ReferenceHandler };

function mediaLabel(copy: ReturnType<typeof useCopy>, index: number, count: number, name: string, overflow: number) {
  const label = copy("Resim {p0} / {p1}, {p2}", "Image {p0} of {p1}, {p2}", { p0: index + 1, p1: count, p2: name });
  return overflow > 0 ? copy("{p0}, {p1} resim daha", "{p0}, {p1} more images", { p0: label, p1: overflow }) : label;
}

function ChipRow({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: space.xs, maxWidth: "100%" }}>
      {children}
    </View>
  );
}

/**
 * A user message's own images as one collage and its other files as compact chips, end-aligned above
 * the bubble. An attachment-only message shows these alone, without an empty bubble.
 */
export function UserMessageAttachments({ block, context }: { block: Block; context?: MessageContext }) {
  if (!context || block.role !== "user") return null;
  const files = messageFiles(block);
  if (!files.length) return null;
  const images = files.filter((file) => file.image);
  const others = files.filter((file) => !file.image);
  return (
    <View style={{ alignSelf: "flex-end", alignItems: "flex-end", gap: space.xs, maxWidth: "100%" }}>
      {images.length ? <UserMessageMedia images={images} context={context} /> : null}
      {others.length ? (
        <ChipRow>
          {others.map((file) => <AttachmentChip key={file.id} {...file} context={context} />)}
        </ChipRow>
      ) : null}
    </View>
  );
}

/**
 * Every image of the message keeps its own guarded read; the visible slots draw tiles at their reserved
 * frames and report what the gallery may show. Images behind "+N" read only while the open gallery
 * shows them or a neighbour page.
 */
function UserMessageMedia({ images, context }: { images: MessageFile[]; context: MessageContext }) {
  const single = images.length === 1 ? images[0] : undefined;
  const sizeKey = single ? JSON.stringify(mediaQueryKey(context, ["media-size", single.id])) : undefined;
  const { natural, onLoad: onSingleLoad } = useNaturalSize(sizeKey);
  const layout = mediaGridLayout(images.length, useUserMediaWidth(), natural);
  const [reports, setReports] = useState<Readonly<Record<string, SlotReport>>>({});
  const actions = useRef<Record<string, SlotActions>>({});
  const [opening, setOpening] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const galleryPage = opening === null ? null : page;
  const open = useCallback((index: number) => { setPage(index); setOpening(index); }, []);
  const report = useCallback((id: string, value: SlotReport | undefined) => setReports((current) => {
    const previous = current[id];
    if (previous?.status === value?.status && previous?.uri === value?.uri) return current;
    const next = { ...current };
    if (value) next[id] = value;
    else delete next[id];
    return next;
  }), []);
  const items: MediaGalleryItem[] = images.map((image) => {
    const state = reports[image.id];
    const uri = state?.status === "ready" ? state.uri : undefined;
    const status: MediaPageStatus | undefined = uri ? undefined : !state || state.status === "ready" ? "loading" : state.status;
    return {
      key: image.id,
      name: image.name,
      uri,
      status,
      detail: image.size !== undefined ? formatAttachmentSize(image.size) : undefined,
      onLoad: () => actions.current[image.id]?.load?.(),
      onUseAsReference: actions.current[image.id]?.useAsReference
        ? (file) => actions.current[image.id]?.useAsReference?.(file)
        : undefined,
    };
  });
  return (
    <>
      <MediaGrid layout={layout}>
        {images.map((image, index) => (
          <MediaSlot
            key={image.id}
            image={image}
            index={index}
            count={images.length}
            frame={layout.tiles[index]}
            overflow={index === layout.tiles.length - 1 ? layout.overflow : 0}
            autoLoad={mediaAutoLoads(index, MEDIA_GRID_SLOTS, galleryPage)}
            context={context}
            onReport={report}
            actions={actions}
            onOpen={open}
            onImageLoad={single ? onSingleLoad : undefined}
          />
        ))}
      </MediaGrid>
      {opening !== null ? (
        <MediaGallery visible items={items} index={opening} context={context} onIndexChange={setPage} onClose={() => setOpening(null)} />
      ) : null}
    </>
  );
}

/**
 * One image's read and tile. While `autoLoad` holds it reads up to 4 MB on its own; larger, unknown or
 * data-saver images wait for a (confirmed) tap.
 */
function MediaSlot({ image, index, count, frame, overflow, autoLoad, context, onReport, actions, onOpen, onImageLoad }: {
  image: MessageFile;
  index: number;
  count: number;
  frame?: MediaFrame;
  overflow: number;
  autoLoad: boolean;
  context: MessageContext;
  onReport(id: string, value: SlotReport | undefined): void;
  actions: { current: Record<string, SlotActions> };
  onOpen(index: number): void;
  onImageLoad?: (size: MediaSize) => void;
}) {
  const copy = useCopy();
  const dataSaver = useDataSaverActive();
  const plan = attachmentPlan("image", image.size, dataSaver);
  const [requested, setRequested] = useState(false);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const scope = useReaderScope(context, image.id);
  const { query, data } = useSessionFile(scope, context, image.id, image.name, image.mimeType, (plan === "inline" && autoLoad) || requested);
  const content = useReaderContentAccess(scope, data ? JSON.stringify([data.uri, data.name]) : undefined, scope.available && !!data);
  const { retry, retryError } = useReaderRetry(scope, query);
  const shown = !!data && content.access.allowed;
  const status: MediaTileStatus = shown
    ? decodeFailed ? "failed" : "ready"
    : query.error ? "failed"
      : !scope.ready || query.isFetching ? "loading"
        : !scope.available || data ? "unavailable"
          : plan === "too-large" ? "too-large"
            : plan === "inline" || requested ? "loading" : "download";
  const download = () => confirmDownload(copy, { kind: "image", name: image.name, size: image.size }, () => setRequested(true));
  const retryLoad = () => {
    if (!decodeFailed) return retryError();
    if (!content.check() || query.isFetching) return;
    setDecodeFailed(false);
    retry();
  };
  const load = status === "download" ? download : status === "failed" ? retryLoad : undefined;
  const sessionId = context.sessionId;
  const useAsReference: ReferenceHandler | undefined = sessionId && data
    ? (file) => appendToDraft({ machineId: context.machineId, sessionId }, { file: { ...file, mimeType: data.mimeType || image.mimeType } })
    : undefined;
  actions.current[image.id] = { load, useAsReference };
  const uri = status === "ready" ? data?.uri : undefined;
  useEffect(() => { onReport(image.id, { status, uri }); }, [image.id, status, uri, onReport]);
  useEffect(() => () => {
    onReport(image.id, undefined);
    delete actions.current[image.id];
  }, [image.id, onReport, actions]);
  if (!frame) return null;
  const open = () => { if (content.check()) onOpen(index); };
  // The "+N" tile always opens the gallery (where the hidden images load) behind the same reader guard:
  // the shown file's access once it is on screen, else this reader's own scope.
  const openOverflow = () => { if (shown ? content.check() : scope.current()) onOpen(index); };
  const press = overflow > 0 ? openOverflow : status === "ready" ? open : load;
  return (
    <MediaTile
      frame={frame}
      status={status}
      uri={uri}
      label={mediaLabel(copy, index, count, image.name, overflow)}
      detail={image.size !== undefined ? formatAttachmentSize(image.size) : undefined}
      overflow={overflow}
      onPress={press}
      onLongPress={status === "ready" ? open : undefined}
      onImageError={() => { if (content.check()) setDecodeFailed(true); }}
      onImageLoad={onImageLoad}
    />
  );
}

/** A non-image file of a user message: one compact chip; a tap (confirmed when large or unknown) opens its reader. */
function AttachmentChip({ id, name, size, mimeType, context }: MessageFile & { context: MessageContext }) {
  const copy = useCopy();
  const opening = useAttachmentOpening(context, id, name, mimeType);
  const kind = attachmentKind(name, mimeType, false);
  const tooLarge = attachmentPlan(kind, size) === "too-large";
  const sizeLabel = size !== undefined ? formatAttachmentSize(size) : "";
  const detail = [sizeLabel, tooLarge ? copy("Çok büyük", "Too large") : ""].filter(Boolean).join(" · ");
  // Like desktop, a long paste reads as what it is; the reader still opens the file by its name.
  const shown = isPastedTextAttachment({ name, mimeType }) ? copy("Yapıştırılan metin", "Pasted text") : name;
  return (
    <>
      <FileChip
        key={opening.key}
        name={shown}
        nameLines={1}
        detail={detail || undefined}
        accessibilityLabel={copy("Dosyayı aç: {p0}", "Open file: {p0}", { p0: shown })}
        disabled={tooLarge || !opening.available}
        onPress={() => confirmDownload(copy, { kind, name: shown, size }, opening.open)}
      />
      {opening.opened ? (
        <AttachmentReader id={id} name={name} mimeType={mimeType} context={context} onClose={opening.close} />
      ) : null}
    </>
  );
}

/**
 * A message still on its way (outbox): the same collage and chips from the device's own staged files,
 * so the bubble does not change shape when the computer's copy replaces it. A `delivered` message is
 * only bridged until that copy arrives and custody may already have deleted its files, so its tiles are
 * inert (no gallery, share or save) and a missing file shows a neutral placeholder tile.
 */
export function LocalMessageAttachments({ files, delivered = false }: { files: readonly StagedAttachment[]; delivered?: boolean }) {
  if (!files.length) return null;
  const images = files.filter((file) => file.kind === "image");
  const others = files.filter((file) => file.kind !== "image");
  return (
    <View style={{ alignSelf: "flex-end", alignItems: "flex-end", gap: space.xs, maxWidth: "100%" }}>
      {images.length ? <LocalMessageMedia images={images} interactive={!delivered} /> : null}
      {others.length ? (
        <ChipRow>
          {others.map((file) => <FileChip key={file.id} name={file.name} nameLines={1} detail={formatAttachmentSize(file.size)} />)}
        </ChipRow>
      ) : null}
    </View>
  );
}

function LocalMessageMedia({ images, interactive }: { images: readonly StagedAttachment[]; interactive: boolean }) {
  const copy = useCopy();
  const { natural, onLoad: onSingleLoad } = useNaturalSize(images.length === 1 ? images[0]!.uri : undefined);
  const layout = mediaGridLayout(images.length, useUserMediaWidth(), natural);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [opening, setOpening] = useState<number | null>(null);
  const items: MediaGalleryItem[] = images.map((image) => ({
    key: image.id,
    name: image.name,
    uri: failed.has(image.id) ? undefined : image.uri,
    status: failed.has(image.id) ? "unavailable" : undefined,
  }));
  return (
    <>
      <MediaGrid layout={layout}>
        {layout.tiles.map((frame) => {
          const image = images[frame.index]!;
          const overflow = frame.index === layout.tiles.length - 1 ? layout.overflow : 0;
          const ready = !failed.has(image.id);
          const open = interactive ? () => setOpening(frame.index) : undefined;
          return (
            <MediaTile
              key={image.id}
              frame={frame}
              status={ready ? "ready" : "unavailable"}
              uri={image.uri}
              label={mediaLabel(copy, frame.index, images.length, image.name, overflow)}
              overflow={overflow}
              onPress={ready || overflow > 0 ? open : undefined}
              onLongPress={ready ? open : undefined}
              onImageError={() => setFailed((current) => new Set(current).add(image.id))}
              onImageLoad={images.length === 1 ? onSingleLoad : undefined}
            />
          );
        })}
      </MediaGrid>
      {/* Delivery may delete the staged files, so a gallery open by then closes with it. */}
      {interactive && opening !== null ? (
        <MediaGallery visible items={items} index={opening} onClose={() => setOpening(null)} />
      ) : null}
    </>
  );
}
