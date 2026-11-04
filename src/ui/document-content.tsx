import { mediaQueryKey, visibleMediaData } from "./media-policy";
import { useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";
import { File } from "expo-file-system";
import { useQuery } from "@tanstack/react-query";
import { Body, Button, ErrorText, Loading, Row } from "./primitives";
import { MessageCode } from "./message-code";
import { documentDisplayName } from "./document-display-name";
import { MessageContent } from "./message-content";
import { MessageImage } from "./message-image";
import { HtmlDocument } from "./html-document";
import { mediaMime, type MessageContext, type OpenDocument } from "./media-policy";
import { useCopy } from "./copy";
import { useMediaSharing } from "./use-media-sharing";
import { space } from "./tokens";

type DocumentContentProps = {
  name: string;
  text?: string;
  uri?: string;
  mimeType?: string;
  context?: MessageContext;
  onReload?: () => void;
  onOpenFile?: OpenDocument;
};

/** Reader-local view and callbacks belong to this file in this Host/project scope. */
export function DocumentContent(props: DocumentContentProps) {
  const identity = JSON.stringify(mediaQueryKey(props.context, ["document-reader", props.name, props.uri, props.mimeType ?? mediaMime(props.name)]));
  return <DocumentContentBody key={identity} {...props} />;
}

function DocumentContentBody({ name, text, uri, mimeType = mediaMime(name), context, onReload, onOpenFile }: DocumentContentProps) {
  const copy = useCopy();
  const [source, setSource] = useState(false);
  const sharing = useMediaSharing({ uri, name, mimeType });
  const mediaType = mimeType.split(";")[0]!.trim().toLowerCase();
  const readable = /^(?:text\/|application\/json)/.test(mediaType);
  const html = mediaType === "text/html";
  const markdown = mediaType === "text/markdown" || /\.(?:md|markdown)$/i.test(name.split(/[?#]/)[0]!);
  const canPreview = html || markdown;
  const extension = /\.([a-z0-9]+)$/i.exec(name.split(/[?#]/)[0]!)?.[1]?.toLowerCase();
  const language = html ? "html" : markdown ? "markdown" : mediaType === "application/json" ? "json" : extension || "text";
  const live = useRef(true);
  useLayoutEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const query = useQuery({
    queryKey: mediaQueryKey(context, [
      "local-document",
      context?.machineId,
      context?.projectId,
      context?.sessionId,
      uri,
    ]),
    queryFn: () => new File(uri!).text(),
    enabled: text === undefined && !!uri && readable,
    retry: false,
  });
  const data = visibleMediaData(query);
  const body = text ?? data;
  if (mediaType.startsWith("image/") && uri)
    return <MessageImage source={uri} alt={name} context={context} localFile onReload={onReload} />;
  return (
    <View style={{ gap: space.sm }}>
      {(body !== undefined && canPreview) || uri ? <Row>
        {body !== undefined && canPreview ? <Button tone="quiet" density="compact"
          label={source ? copy("Önizle", "Preview") : copy("Kaynağı göster", "Show source")}
          onPress={() => { if (live.current) setSource(value => !value); }} /> : null}
        {uri ? <Button tone="quiet" label={copy("Paylaş / kaydet", "Share / save")}
          busy={sharing.busy} onPress={sharing.share} /> : null}
      </Row> : null}
      <ErrorText error={sharing.error} />
      {(query.error || sharing.error) && onReload ? <Button tone="quiet"
        label={copy("Dosyayı yeniden yükle", "Reload file")} disabled={sharing.busy}
        onPress={() => { if (sharing.reset()) onReload(); }} /> : null}
      <ErrorText error={query.error} />
      {query.error && !onReload ? <Button tone="quiet" label={copy("Yeniden dene", "Retry")}
        busy={query.isFetching} onPress={() => { if (live.current) void query.refetch({ cancelRefetch: false }); }} /> : null}
      {body !== undefined ? (
        !source && html ? <HtmlDocument html={body} name={name} context={context} />
          : !source && markdown ? <MessageContent onOpenFile={onOpenFile} text={body}
            context={context ? { ...context, basePath: name } : undefined} />
          : <MessageCode code={body} language={language} context={context}
            allowPreview={false} readerTitle={documentDisplayName(name)} copyLabel={copy("Kopyala", "Copy")} />
      ) : query.isFetching ? <Loading /> : !query.error ? <Body muted>
        {copy("Bu dosyayı başka bir uygulamada açabilirsin.", "Open this file in another app.")}
      </Body> : null}
    </View>
  );
}
