import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { Body, ErrorText, Loading } from "./primitives";
import { useCopy } from "./copy";
import { formatAttachmentSize } from "./media-inline-policy";
import { listZipEntries, ZIP_PREVIEW_MAX_ENTRIES, ZIP_PREVIEW_MAX_BYTES } from "./preview-zip";
import { useMobileTheme } from "./theme";
import { space } from "./tokens";

/** The entries of a downloaded zip with sizes. Nothing is extracted to disk. */
export function ZipList({ uri }: { uri: string }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const query = useQuery({
    queryKey: ["zip-listing", uri],
    retry: false,
    queryFn: async () => {
      const file = new File(uri);
      if (file.size > ZIP_PREVIEW_MAX_BYTES) throw new Error(copy("Arşiv önizleme için çok büyük.", "This archive is too large to preview."));
      return listZipEntries(await file.bytes());
    },
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorText error={query.error} />;
  const { entries, total, truncated } = query.data;
  return (
    <View style={{ gap: space.xs }}>
      <Body muted>{copy("{p0} öğe", "{p0} items", { p0: total })}</Body>
      {entries.map((entry) => (
        <View key={entry.name} style={{ flexDirection: "row", gap: space.sm, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.separator }}>
          <Body style={{ flex: 1 }} numberOfLines={2}>{entry.name}</Body>
          {entry.directory ? null : <Body muted>{formatAttachmentSize(entry.size)}</Body>}
        </View>
      ))}
      {truncated ? <Body muted>{copy("İlk {p0} öğe gösteriliyor.", "Showing the first {p0} items.", { p0: ZIP_PREVIEW_MAX_ENTRIES })}</Body> : null}
    </View>
  );
}
