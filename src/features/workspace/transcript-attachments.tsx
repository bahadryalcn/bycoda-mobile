import { useMobileTheme } from "@/ui/theme";
import { mediaQueryKey } from "@/ui/media-policy";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { ErrorText, FormActions, Loading, Sheet } from "@/ui/primitives";
import { AttachmentPreview, useSessionFile } from "./transcript-attachment-preview";
import { attachmentKind } from "@/ui/media-inline-policy";
import { DocumentPreview } from "@/ui/document-preview";
import type { LoadedMedia } from "@/ui/media-loader";
import type { MessageContext } from "@/ui/media-policy";
import { useCopy } from "@/ui/copy";
import { useHostClient, useHostReadActive } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { usePrivateMediaData } from "@/ui/use-private-media-data";
import { useReaderContentAccess, useReaderRetry, useReaderScope } from "@/ui/use-reader-scope";
import { space } from "@/ui/tokens";
import { loopbackScopeKey } from "@/ui/loopback-link";
import type { Block } from "./wire";
import { ReaderContext } from "@/ui/reader-context";
import { RecordAccessUnavailable } from "./unavailable-state";
import { ComposerLinks } from "./composer-links";
import { composerLinks } from "./attachment-presentation";

export function AttachmentFile({
  id,
  name,
  size,
  mimeType,
  image,
  context,
  thumbnail,
}: {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  image: boolean;
  context: MessageContext;
  thumbnail?: boolean;
}) {
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
  return (
    <>
      <AttachmentPreview
        key={key}
        id={id}
        name={name}
        size={size}
        mimeType={mimeType}
        kind={attachmentKind(name, mimeType, image)}
        context={context}
        onOpenFile={open}
        thumbnail={thumbnail}
      />
      {selection === identity ? (
        <AttachmentReader
          id={id}
          name={name}
          mimeType={mimeType}
          context={context}
          onClose={close}
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
      {!ready || (available && query.isFetching && !query.error) ? <Loading /> : null}
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
export function TranscriptAttachments({
  block,
  context,
}: {
  block: Block;
  context?: MessageContext;
}) {
  useMobileTheme();
  // Sent messages mirror the composer: image tiles, file chips and link chips.
  const sent = block.role === "user";
  const links = useMemo(() => (sent ? composerLinks(block.text ?? "") : []), [sent, block.text]);
  const files = [
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
  if (!context || (!files.length && !links.length)) return null;
  const attach = (file: (typeof files)[number]) => (
    <AttachmentFile key={file.id} {...file} context={context} thumbnail={sent} />
  );
  const tiles = sent ? files.filter((file) => file.image) : [];
  return (
    <View style={{ gap: space.xs }}>
      {tiles.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {tiles.map(attach)}
        </View>
      ) : null}
      {files.filter((file) => !tiles.includes(file)).map(attach)}
      {links.length ? <ComposerLinks links={links} ownerScope={loopbackScopeKey(context)} /> : null}
    </View>
  );
}
