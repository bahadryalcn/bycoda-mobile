import { mediaQueryKey, visibleMediaData } from "./media-policy";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { Body, Button, ErrorText, Loading, PressableCard } from "./primitives";
import { useCopy } from "./copy";
import { colors, radii, space } from "./tokens";
import { externalImageUrl, type MessageContext } from "./media-policy";
import { loadProjectMedia, loadSessionMedia } from "./media-loader";
import { MediaViewer } from "./media-viewer";
import { inlineRaster } from "./inline-raster";
import ImageIcon from "lucide-react-native/icons/image";
import { ChatSummary } from "./chat-controls";
import { Sheet } from "./dialogs";

export function MessageImage({
  deferred = false,
  ...props
}: Parameters<typeof InlineMessageImage>[0] & { deferred?: boolean }) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  if (!deferred) return <InlineMessageImage {...props} />;
  const name = props.alt || copy("Resim", "Image");
  return (
    <>
      <ChatSummary
        label={name}
        detail={copy("Resmi aç", "Open image")}
        icon={<ImageIcon size={16} color={colors.muted} />}
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} title={name} size="full" onClose={() => setOpen(false)}>
        {open ? <InlineMessageImage {...props} /> : null}
      </Sheet>
    </>
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
}: {
  source: string;
  alt?: string;
  context?: MessageContext;
  attachmentId?: string;
  mimeType?: string;
  localFile?: boolean;
  onReload?: () => void;
}) {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [ratio, setRatio] = useState(1.6);
  const [attempt, setAttempt] = useState(0);
  const external = externalImageUrl(source);
  const embedded = useMemo(() => inlineRaster(source), [source]);
  const dataSource = /^data:/i.test(source);
  const noteAsset = source.startsWith("/note-assets/");
  const [allowExternal, setAllowExternal] = useState(false);
  useEffect(() => {
    setAllowExternal(false);
    setLoaded(false);
    setFailed(false);
  }, [source, attachmentId]);
  const local = localFile && source.startsWith("file:") ? source : null;
  const query = useQuery({
    queryKey: mediaQueryKey(context, [
      "message-media",
      context?.machineId,
      context?.projectId,
      context?.sessionId,
      context?.cwd,
      context?.basePath,
      attachmentId,
      dataSource ? "inline-raster" : source,
    ]),
    queryFn: ({ signal }) =>
      attachmentId
        ? loadSessionMedia(context!, attachmentId, alt || source, mimeType, signal)
        : loadProjectMedia(context!, source, signal),
    enabled: !!context && !external && !local && !dataSource && !noteAsset,
    retry: false,
    staleTime: Infinity,
    gcTime: 60_000,
    networkMode: "always",
  });
  const data = visibleMediaData(query);
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
        {query.isFetching ? <Loading /> : null}
        <ErrorText error={query.error} />
        {query.error ? (
          <Button
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
        onPress={() => setOpen(true)}
        style={{
          padding: 0,
          overflow: "hidden",
          borderRadius: radii.control,
          backgroundColor: colors.raised,
        }}
      >
        <Image
          key={attempt}
          source={{ uri }}
          accessibilityLabel={alt}
          contentFit="contain"
          transition={0}
          style={{ width: "100%", aspectRatio: Math.min(3, Math.max(0.6, ratio)), maxHeight: 240 }}
          onLoad={(event) => {
            setLoaded(true);
            setFailed(false);
            if (event.source.width && event.source.height)
              setRatio(event.source.width / event.source.height);
          }}
          onError={() => {
            setFailed(true);
            setLoaded(true);
          }}
        />
      </PressableCard>
      {!loaded ? <Loading /> : null}
      <ErrorText error={query.error} />
      {failed || query.error ? (
        <Button
          label={copy("Resmi yeniden yükle", "Retry image")}
          onPress={() => {
            setFailed(false);
            setLoaded(false);
            if (onReload) onReload();
            else if (context && !embedded) void query.refetch();
            else setAttempt(attempt + 1);
          }}
        />
      ) : null}
      {open ? (
        <MediaViewer
          uri={uri}
          name={alt || copy("Resim", "Image")}
          visible
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}
