import { mediaQueryKey, visibleMediaData } from "./media-policy";
import { useState } from "react";
import { View } from "react-native";
import { File } from "expo-file-system";
import { useQuery } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { Body, Button, CodePanel, CodeText, ErrorText, Loading, Row } from "./primitives";
import { MessageContent } from "./message-content";
import { MessageImage } from "./message-image";
import { HtmlDocument } from "./html-document";
import { mediaMime, type MessageContext, type OpenDocument } from "./media-policy";
import { loadProjectMedia } from "./media-loader";
import { useCopy } from "./copy";
import { space } from "./tokens";

export function ProjectMediaContent({
  path,
  context,
  onOpenFile,
}: {
  path: string;
  context: MessageContext;
  onOpenFile?: OpenDocument;
}) {
  const copy = useCopy();
  const query = useQuery({
    queryKey: mediaQueryKey(context, [
      "project-media",
      context.machineId,
      context.projectId,
      context.sessionId,
      context.cwd,
      context.basePath,
      path,
    ]),
    queryFn: ({ signal }) => loadProjectMedia(context, path, signal),
    retry: false,
    networkMode: "always",
  });
  const data = visibleMediaData(query);
  return (
    <View style={{ gap: space.sm }}>
      {query.isFetching ? <Loading /> : null}
      <ErrorText error={query.error} />
      {query.error ? (
        <Button
          label={copy("Yeniden dene", "Retry")}
          onPress={() => {
            void query.refetch();
          }}
        />
      ) : null}
      {data ? (
        <DocumentContent
          onOpenFile={onOpenFile}
          {...data}
          name={path}
          context={context}
          onReload={() => {
            void query.refetch();
          }}
        />
      ) : null}
    </View>
  );
}
export function DocumentContent({
  name,
  text,
  uri,
  mimeType = mediaMime(name),
  context,
  onReload,
  onOpenFile,
}: {
  name: string;
  text?: string;
  uri?: string;
  mimeType?: string;
  context?: MessageContext;
  onReload?: () => void;
  onOpenFile?: OpenDocument;
}) {
  const copy = useCopy();
  const [source, setSource] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const readable = /^(?:text\/|application\/json)/.test(mimeType);
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
  if (mimeType.startsWith("image/") && uri)
    return <MessageImage source={uri} alt={name} localFile onReload={onReload} />;
  return (
    <View style={{ gap: space.sm }}>
      {body !== undefined ? (
        <>
          <Row>
            {/html|markdown/.test(mimeType) ? (
              <Button
                tone="quiet"
                density="compact"
                label={source ? copy("Önizle", "Preview") : copy("Kaynağı göster", "Show source")}
                onPress={() => setSource(!source)}
              />
            ) : null}
          </Row>
          {!source && mimeType === "text/html" ? (
            <HtmlDocument html={body} name={name} context={context} />
          ) : !source && (mimeType === "text/markdown" || /\.md$/i.test(name)) ? (
            <MessageContent
              onOpenFile={onOpenFile}
              text={body}
              context={context ? { ...context, basePath: name } : undefined}
            />
          ) : (
            <CodePanel>
              <CodeText>{body}</CodeText>
            </CodePanel>
          )}
        </>
      ) : query.isFetching ? (
        <Loading />
      ) : (
        <Body muted>
          {copy("Bu dosyayı başka bir uygulamada açabilirsin.", "Open this file in another app.")}
        </Body>
      )}
      {uri ? (
        <Button
          tone="quiet"
          label={copy("Paylaş / kaydet", "Share / save")}
          onPress={() => {
            void Sharing.isAvailableAsync()
              .then((available) => {
                if (!available)
                  throw new Error(copy("Paylaşım kullanılamıyor.", "Sharing is unavailable."));
                return Sharing.shareAsync(uri, { mimeType, dialogTitle: name });
              })
              .catch(setError);
          }}
        />
      ) : null}
      <ErrorText error={query.error || error} />
    </View>
  );
}
