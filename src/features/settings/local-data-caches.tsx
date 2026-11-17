import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, Paths } from "expo-file-system";
import { clearMediaCache } from "@/ui/media-loader";
import Eraser from "lucide-react-native/icons/eraser";
import { Body, NavigationGroup, NavigationRow, SettingIcon, Stack, ValueRow } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { formatBytes, savedDraftBytes, type LocalDataSizes } from "./local-data-sizes";

const directorySize = (directory: Directory) => (directory.exists ? (directory.size ?? 0) : 0);

async function measure(): Promise<LocalDataSizes> {
  return {
    media: directorySize(new Directory(Paths.cache, "chat-media")),
    attachments: directorySize(new Directory(Paths.document, "chat-drafts")),
    drafts: await savedDraftBytes(AsyncStorage),
  };
}

/**
 * Sizes of what this phone stores locally. Clearing caches removes only re-downloadable media;
 * drafts and their attachments are the owner's work and are deleted through "Delete saved drafts".
 */
export function LocalDataCaches() {
  const copy = useCopy();
  const [sizes, setSizes] = useState<LocalDataSizes | null>(null);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback(() => {
    measure().then((next) => { setSizes(next); setFailed(false); }).catch(() => setFailed(true));
  }, []);
  // Measured when the section opens and again after clearing; sizes are never kept in a store.
  useEffect(refresh, [refresh]);
  const clear = () => {
    try { clearMediaCache(); } catch { setFailed(true); }
    refresh();
  };
  const row = (label: string, bytes: number | undefined) => (
    <ValueRow label={label} value={bytes === undefined ? "…" : formatBytes(bytes)} />
  );
  return (
    <Stack>
      <NavigationGroup>
        {row(copy("Medya önbelleği", "Media cache"), sizes?.media)}
        {row(copy("Ek taslakları", "Attachment drafts"), sizes?.attachments)}
        {row(copy("Kaydedilmiş taslaklar", "Saved drafts"), sizes?.drafts)}
        <NavigationRow
          label={copy("Önbellekleri temizle", "Clear caches")}
          intent="command"
          icon={<SettingIcon glyph={Eraser} />}
          disabled={!sizes || sizes.media === 0}
          onPress={clear}
        />
      </NavigationGroup>
      {failed ? <Body muted>{copy("Boyutlar okunamadı.", "Sizes could not be read.")}</Body> : null}
    </Stack>
  );
}
