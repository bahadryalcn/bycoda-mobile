import { useMobileTheme } from "@/ui/theme";
import { mediaQueryKey, visibleMediaData } from "@/ui/media-policy";
import { useState } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import File from "lucide-react-native/icons/file";
import ImageIcon from "lucide-react-native/icons/image";
import { Button, ErrorText, Loading, Sheet } from "@/ui/primitives";
import { ChatSummary } from "@/ui/chat-controls";
import { DocumentPreview } from "@/ui/document-preview";
import { loadSessionMedia } from "@/ui/media-loader";
import type { MessageContext } from "@/ui/media-policy";
import { useCopy } from "@/ui/copy";
import { colors, space } from "@/ui/tokens";
import type { Block } from "./wire";

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
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: mediaQueryKey(context, ["session-file", context.machineId, context.sessionId, id]),
    queryFn: ({ signal }) =>
      loadSessionMedia(context, id, name, mimeType || "application/octet-stream", signal),
    enabled: open,
    retry: false,
    staleTime: Infinity,
    gcTime: 60_000,
    networkMode: "always",
  });
  const data = visibleMediaData(query);
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
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} title={name} size="full" onClose={() => setOpen(false)}>
        {open ? (
          <>
            {query.isFetching ? <Loading /> : null}
            <ErrorText error={query.error} />
            {query.error ? (
              <Button
                label={copy("Dosyayı yeniden yükle", "Retry file")}
                onPress={() => {
                  void query.refetch();
                }}
              />
            ) : null}
            {data ? (
              <DocumentPreview
                {...data}
                context={context}
                onReload={() => {
                  void query.refetch();
                }}
              />
            ) : null}
          </>
        ) : null}
      </Sheet>
    </>
  );
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
