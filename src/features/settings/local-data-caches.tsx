import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, Paths } from "expo-file-system";
import { clearMediaCache } from "@/ui/media-loader";
import Eraser from "lucide-react-native/icons/eraser";
import { NavigationGroup, NavigationRow, Notice, Section, SettingIcon, ValueRow } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { showToast } from "@/ui/toast";
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
    const freed = sizes?.media ?? 0;
    try { clearMediaCache(); } catch {
      showToast({ tone: "danger", message: copy("Medya önbelleği temizlenemedi.", "The media cache could not be cleared.") });
      refresh();
      return;
    }
    showToast({ message: copy("{p0} boşaltıldı.", "{p0} freed.", { p0: formatBytes(freed) }) });
    refresh();
  };
  // Unknown sizes are omitted rather than shown as a placeholder.
  const row = (label: string, bytes: number | undefined) => (
    <ValueRow label={label} value={bytes === undefined ? undefined : formatBytes(bytes)} />
  );
  return (
    <Section title={copy("Depolama", "Storage")}>
      <NavigationGroup>
        {row(copy("Medya önbelleği", "Media cache"), sizes?.media)}
        {row(copy("Ek taslakları", "Attachment drafts"), sizes?.attachments)}
        {row(copy("Kaydedilmiş taslaklar", "Saved drafts"), sizes?.drafts)}
        <NavigationRow
          label={copy("Medya önbelleğini temizle", "Clear media cache")}
          intent="command"
          icon={<SettingIcon glyph={Eraser} />}
          separator={false}
          disabled={!sizes || sizes.media === 0}
          onPress={clear}
        />
      </NavigationGroup>
      {failed ? <Notice tone="warning" message={copy("Boyutlar okunamadı.", "Sizes could not be read.")} onRetry={refresh} /> : null}
    </Section>
  );
}
