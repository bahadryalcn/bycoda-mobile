import { useMobileTheme } from "@/ui/theme";
import { mediaQueryKey } from "@/ui/media-policy";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import File from "lucide-react-native/icons/file";
import ImageIcon from "lucide-react-native/icons/image";
import { ErrorText, FormActions, Loading, Notice, Sheet } from "@/ui/primitives";
import { ChatSummary } from "@/ui/chat-controls";
import { DocumentPreview } from "@/ui/document-preview";
import { loadSessionMedia, type LoadedMedia } from "@/ui/media-loader";
import type { MessageContext } from "@/ui/media-policy";
import { useCopy } from "@/ui/copy";
import { useHostClient, useHostReadActive } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { usePrivateMediaData } from "@/ui/use-private-media-data";
import { useReaderContentAccess, useReaderRetry, useReaderScope } from "@/ui/use-reader-scope";
import { colors, space } from "@/ui/tokens";
import type { Block } from "./wire";
import { ReaderContext } from "@/ui/reader-context";

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
  useMobileTheme();
  const copy = useCopy();
  const active = useHostReadActive();
  const access = usePrivateContentAccess(), mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const key = JSON.stringify(mediaQueryKey(context, ["attachment-preview", id, name, mimeType]));
  const identity = useMemo(() => ({}), [key, context.client]);
  const review = useMemo(() => reviewedMachine(context.client.machine), [identity]);
  const [selection, setSelection] = useState<object | null>(null);
  const intent = useMemo(() => ({}), [identity, selection, active, access.allowed]);
  const available = active && access.allowed && access.check() && context.machineId === review?.id && isReviewedMachine(review, useMachines.getState());
  const live = useRef({ identity, selection, intent, active, access });
  live.current = { identity, selection, intent, active, access };
  const open = () => {
    if (!mounted.current || live.current.identity !== identity || live.current.intent !== intent || live.current.selection === identity || context.machineId !== review?.id || !live.current.active ||
      !live.current.access.allowed || !live.current.access.check() || !isReviewedMachine(review, useMachines.getState())) return;
    live.current.selection = identity; setSelection(identity);
  };
  const close = () => { if (mounted.current && live.current.identity === identity && live.current.selection === identity) { live.current.selection = null; setSelection(null); } };
  return (
    <>
      <ChatSummary
        label={name}
        detail={[
          size !== undefined ? `${Math.ceil(size / 1024)} KB` : "",
          image ? copy("Resmi aç", "Open image") : copy("Dosyayı aç", "Open file"),
        ]
          .filter(Boolean)
          .join(" · ")}
        icon={
          image ? (
            <ImageIcon size={16} color={colors.muted} />
          ) : (
            <File size={16} color={colors.muted} />
          )
        }
        disabled={!available}
        onPress={open}
      />
      {selection === identity ? <AttachmentReader id={id} name={name} mimeType={mimeType} context={context} onClose={close} /> : null}
    </>
  );
}

/** One explicit opening owns reads, callbacks, and all descendant previews. */
function AttachmentReader({ id, name, mimeType, context, onClose }: {
  id: string; name: string; mimeType?: string; context: MessageContext; onClose(): void;
}) {
  const copy = useCopy(), scope = useReaderScope(context, id);
  const { ready, available } = scope;
  const queryKey = mediaQueryKey(context, ["session-file", context.machineId, context.sessionId, id]);
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => { scope.assertCurrent(); const value = await loadSessionMedia(context, id, name, mimeType || "application/octet-stream", signal); scope.assertCurrent(); return value; },
    enabled: available, retry: false, staleTime: Infinity, gcTime: 60_000, networkMode: "always",
  });
  const data = usePrivateMediaData(queryKey, query);
  const content = useReaderContentAccess(scope, data ? JSON.stringify([data.uri, data.name, data.mimeType]) : undefined, available && !!data);
  const { retry, retryError } = useReaderRetry(scope, query);
  const close = () => scope.close(onClose);
  const reloadContent = () => { if (content.check()) retry(); };
  return <Sheet visible title={name} size="full" onClose={close}
    footer={available && query.error ? <FormActions submitLabel={copy("Dosyayı yeniden yükle", "Retry file")} onSubmit={retryError} busy={query.isFetching}
      feedback={<ErrorText error={query.error} />}
      cancelLabel={copy("Kapat", "Close")} onCancel={close} allowCancelWhileBusy /> : <FormActions tone="quiet" submitLabel={copy("Kapat", "Close")} onSubmit={close} />}>
    {!ready || available && query.isFetching && !query.error ? <Loading /> : null}
    {!available && ready ? <Notice message={copy("Kayıt erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.", "Record access is unavailable. Check the original computer and project connection.")} /> : null}
    {available ? <>{data ? <PrivateContentAccessProvider value={content.access}>
      <ScopedAttachmentContent data={data} context={context} onReload={reloadContent} />
    </PrivateContentAccessProvider> : null}</> : null}
  </Sheet>;
}

function ScopedAttachmentContent({ data, context, onReload }: { data: LoadedMedia; context: MessageContext; onReload(): void }) {
  const client = useHostClient();
  return client ? <><ReaderContext context={context} /><DocumentPreview {...data} context={{ ...context, client }} onReload={onReload} /></> : null;
}
export function TranscriptAttachments({
  block,
  context,
}: {
  block: Block;
  context?: MessageContext;
}) {
  useMobileTheme();
  if (!context || (!block.image && !block.attachments?.length)) return null;
  return (
    <View style={{ gap: space.xs }}>
      {block.image ? (
        <AttachmentFile
          id={block.id}
          name={block.image.name}
          image
          size={block.image.size}
          mimeType={block.image.mimeType}
          context={context}
        />
      ) : null}
      {block.attachments?.map((file) => (
        <AttachmentFile
          key={file.id}
          id={file.id}
          name={file.name}
          size={file.size}
          image={file.kind === "image"}
          mimeType={file.mimeType}
          context={context}
        />
      ))}
    </View>
  );
}
