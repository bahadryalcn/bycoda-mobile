import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import Maximize from "lucide-react-native/icons/maximize-2";
import { Attachment } from "panelui-native/components/attachment";
import { Body, Button, ErrorText, IconButton } from "@/ui/primitives";
import { FileChip, FileKindTile } from "@/ui/file-chip";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
import { loadSessionMedia } from "@/ui/media-loader";
import { MediaViewer } from "@/ui/media-viewer";
import { resolveMediaMime, mediaQueryKey, type MessageContext } from "@/ui/media-policy";
import {
  attachmentPlan, downloadNeedsConfirmation, formatAttachmentSize, type AttachmentKind,
} from "@/ui/media-inline-policy";
import { useDataSaverActive } from "@/state/data-saver";
import { useMobileTheme } from "@/ui/theme";
import { metrics, radii, space } from "@/ui/tokens";
import { InlineVideo } from "@/ui/media-video";
import { usePrivateMediaData } from "@/ui/use-private-media-data";
import { useReaderContentAccess, useReaderRetry, useReaderScope } from "@/ui/use-reader-scope";
import { appendToDraft } from "./draft-append";

export const sessionFileKey = (context: MessageContext, id: string) =>
  mediaQueryKey(context, ["session-file", context.machineId, context.sessionId, id]);

/** The one read of a session attachment; the explicit reader sheet shares this cache entry. */
export function useSessionFile(
  scope: ReturnType<typeof useReaderScope>, context: MessageContext, id: string, name: string, mimeType: string | undefined, enabled: boolean,
) {
  const queryKey = sessionFileKey(context, id);
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      scope.assertCurrent();
      const value = await loadSessionMedia(context, id, name, resolveMediaMime(name, mimeType), signal);
      scope.assertCurrent();
      return value;
    },
    enabled: enabled && scope.available, retry: false, staleTime: Infinity, gcTime: 60_000, networkMode: "always",
  });
  return { query, data: usePrivateMediaData(queryKey, query) };
}

/** Starts a download at once when small; a large or unknown size asks first. */
export function confirmDownload(copy: ReturnType<typeof useCopy>, file: { kind: AttachmentKind; name: string; size?: number }, start: () => void) {
  if (!downloadNeedsConfirmation(file.kind, file.size)) return start();
  const sizeLabel = file.size !== undefined ? formatAttachmentSize(file.size) : "";
  confirmAction(
    copy("Dosya indirilsin mi?", "Download this file?"),
    copy("{p0} cihaza indirilecek. Büyük olabilir.", "{p0} will be downloaded to this device. It may be large.", { p0: [file.name, sizeLabel].filter(Boolean).join(" · ") }),
    copy("İndir", "Download"), start, copy("Vazgeç", "Cancel"), "default",
  );
}

/**
 * Received images up to 4 MB appear in the chat; other files wait for an explicit (confirmed when large)
 * download. A user message's own images and files use the media grid and chips in transcript-attachments.
 */
export function AttachmentPreview({ id, name, size, mimeType, kind, context, onOpenFile }: {
  id: string; name: string; size?: number; mimeType?: string; kind: AttachmentKind; context: MessageContext; onOpenFile(): void;
}) {
  const { colors } = useMobileTheme(), copy = useCopy();
  const dataSaver = useDataSaverActive();
  const plan = attachmentPlan(kind, size, dataSaver);
  const [requested, setRequested] = useState(false), [viewer, setViewer] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const scope = useReaderScope(context, id);
  const { query, data } = useSessionFile(scope, context, id, name, mimeType, plan === "inline" || requested);
  const content = useReaderContentAccess(scope, data ? JSON.stringify([data.uri, data.name]) : undefined, scope.available && !!data);
  const { retry, retryError } = useReaderRetry(scope, query);
  const sizeLabel = size !== undefined ? formatAttachmentSize(size) : "";
  const download = () => confirmDownload(copy, { kind, name, size }, () => setRequested(true));
  if (data && content.access.allowed) {
    if (kind === "image" && imageFailed) return <View style={{ gap: space.xs }}>
      <Body numberOfLines={2}>{name}</Body>
      <Body muted>{copy("Önizleme açılamadı.", "Preview could not be opened.")}</Body>
      <Button tone="quiet" label={copy("Yeniden dene", "Retry")} busy={query.isFetching} onPress={() => {
        if (!content.check() || query.isFetching) return;
        setImageFailed(false);
        retry();
      }} />
    </View>;
    const sessionId = context.sessionId;
    const useAsReference = sessionId ? (file: { uri: string; name: string }) =>
      appendToDraft({ machineId: context.machineId, sessionId }, { file: { ...file, mimeType: data.mimeType || mimeType } }) : undefined;
    const viewerNode = viewer ? <MediaViewer uri={data.uri} name={name} visible context={context} onClose={() => setViewer(false)} onUseAsReference={useAsReference} /> : null;
    if (kind === "video") return <InlineVideo uri={data.uri} name={name} size={size} />;
    if (kind !== "image") return <FileChip name={name} detail={[sizeLabel, copy("Aç", "Open")].filter(Boolean).join(" · ")}
      accessibilityLabel={copy("Dosyayı aç: {p0}", "Open file: {p0}", { p0: name })} onPress={() => { if (content.check()) onOpenFile(); }} />;
    return (
      <View style={{ gap: space.xs }}>
        <Attachment size="xs" orientation="vertical" className="w-full border-0 p-0" accessibilityLabel={copy("Tam ekran aç: {p0}", "Open full screen: {p0}", { p0: name })} onPress={() => setViewer(true)} onLongPress={() => setViewer(true)}>
          <Attachment.Media variant="image" className="w-full rounded-xl">
            <Image source={{ uri: data.uri }} accessibilityLabel={name} contentFit="contain" transition={0} onError={() => { if (content.check()) setImageFailed(true); }} style={{ width: "100%", aspectRatio: 1.5, maxHeight: 320 }} />
          </Attachment.Media>
        </Attachment>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Body muted style={{ flex: 1 }} numberOfLines={1}>{[name, sizeLabel].filter(Boolean).join(" · ")}</Body>
          <IconButton label={copy("Tam ekran", "Full screen")} density="compact" onPress={() => setViewer(true)}><Maximize size={16} color={colors.muted} /></IconButton>
        </View>
        {viewerNode}
      </View>
    );
  }
  const loading = query.isFetching && !query.error;
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingStart: space.xs, paddingEnd: space.sm,
        minHeight: metrics.touchTarget, borderRadius: radii.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel }}>
        <FileKindTile name={name} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body style={{ fontWeight: "500" }}>{name}</Body>
          {sizeLabel ? <Body muted>{sizeLabel}</Body> : null}
        </View>
        {plan === "too-large" ? <Body muted>{copy("Çok büyük", "Too large")}</Body>
          : <Button tone="quiet" label={query.error ? copy("Yeniden dene", "Retry") : copy("İndir", "Download")} busy={loading}
            disabled={!scope.available || loading} onPress={query.error ? retryError : requested ? () => undefined : download} />}
      </View>
      {/* The busy Download button owns this read's spinner. */}
      <ErrorText error={query.error} />
    </View>
  );
}
