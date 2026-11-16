import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import File from "lucide-react-native/icons/file";
import FileText from "lucide-react-native/icons/file-text";
import ImageIcon from "lucide-react-native/icons/image";
import Film from "lucide-react-native/icons/film";
import Maximize from "lucide-react-native/icons/maximize-2";
import { Attachment } from "panelui-native/components/attachment";
import { Body, Button, ErrorText, IconButton, Loading } from "@/ui/primitives";
import { ChatSummary } from "@/ui/chat-controls";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
import { loadSessionMedia } from "@/ui/media-loader";
import { MediaViewer } from "@/ui/media-viewer";
import { resolveMediaMime, mediaQueryKey, type MessageContext } from "@/ui/media-policy";
import {
  attachmentPlan, downloadNeedsConfirmation, formatAttachmentSize, type AttachmentKind,
} from "@/ui/media-inline-policy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { InlineVideo } from "@/ui/media-video";
import { usePrivateMediaData } from "@/ui/use-private-media-data";
import { useReaderContentAccess, useReaderRetry, useReaderScope } from "@/ui/use-reader-scope";
import { appendToDraft } from "./draft-append";

const THUMBNAIL = 96;

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

const icons = { image: ImageIcon, pdf: FileText, markdown: FileText, video: Film, file: File } as const;

/** Images up to 4 MB appear in the chat; other files wait for an explicit (confirmed when large) download. */
export function AttachmentPreview({ id, name, size, mimeType, kind, context, onOpenFile, thumbnail }: {
  id: string; name: string; size?: number; mimeType?: string; kind: AttachmentKind; context: MessageContext; onOpenFile(): void;
  /** Sent messages show images as small tiles like the composer; a tap or long press opens the viewer. */
  thumbnail?: boolean;
}) {
  const { colors } = useMobileTheme(), copy = useCopy();
  const plan = attachmentPlan(kind, size);
  const [requested, setRequested] = useState(false), [viewer, setViewer] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const scope = useReaderScope(context, id);
  const { query, data } = useSessionFile(scope, context, id, name, mimeType, plan === "inline" || requested);
  const content = useReaderContentAccess(scope, data ? JSON.stringify([data.uri, data.name]) : undefined, scope.available && !!data);
  const { retry, retryError } = useReaderRetry(scope, query);
  const Icon = icons[kind];
  const sizeLabel = size !== undefined ? formatAttachmentSize(size) : "";
  const download = () => {
    const start = () => setRequested(true);
    if (!downloadNeedsConfirmation(kind, size)) return start();
    confirmAction(
      copy("Dosya indirilsin mi?", "Download this file?"),
      copy("{p0} cihaza indirilecek. Büyük olabilir.", "{p0} will be downloaded to this device. It may be large.", { p0: [name, sizeLabel].filter(Boolean).join(" · ") }),
      copy("İndir", "Download"), start, copy("Vazgeç", "Cancel"), "default",
    );
  };
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
    if (kind === "image" && thumbnail) return (
      <View>
        <Attachment size="xs" orientation="vertical" className="h-24 w-24 border-0 p-0" accessibilityLabel={copy("Tam ekran aç: {p0}", "Open full screen: {p0}", { p0: name })} onPress={() => setViewer(true)} onLongPress={() => setViewer(true)}>
          <Attachment.Media variant="image" className="h-24 w-24 rounded-xl">
            <Image source={{ uri: data.uri }} accessibilityLabel={name} contentFit="contain" transition={0} onError={() => { if (content.check()) setImageFailed(true); }} style={{ width: THUMBNAIL, height: THUMBNAIL }} />
          </Attachment.Media>
        </Attachment>
        {viewerNode}
      </View>
    );
    if (kind === "video") return <InlineVideo uri={data.uri} name={name} size={size} />;
    if (kind !== "image") return <ChatSummary label={name} detail={[sizeLabel, copy("Aç", "Open")].filter(Boolean).join(" · ")} icon={<Icon size={16} color={colors.muted} />} onPress={() => { if (content.check()) onOpenFile(); }} />;
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm }}>
        <Icon size={16} color={colors.muted} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body style={{ fontWeight: "500" }}>{name}</Body>
          {sizeLabel ? <Body muted>{sizeLabel}</Body> : null}
        </View>
        {plan === "too-large" ? <Body muted>{copy("Çok büyük", "Too large")}</Body>
          : <Button tone="quiet" label={query.error ? copy("Yeniden dene", "Retry") : copy("İndir", "Download")} busy={loading}
            disabled={!scope.available || loading} onPress={query.error ? retryError : requested ? () => undefined : download} />}
      </View>
      {loading ? <Loading /> : null}
      <ErrorText error={query.error} />
    </View>
  );
}
