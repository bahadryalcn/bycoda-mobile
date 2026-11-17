import { View } from "react-native";
import { Sheet } from "@/ui/dialogs";
import { Body } from "@/ui/typography";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { SHORTCUTS, type ShortcutId } from "./keyboard-model";

/** Hardware-keyboard cheat sheet (⌘/). */
export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  const copy = useCopy();
  const titles: Record<ShortcutId, string> = {
    palette: copy("Komut paleti", "Command palette"),
    search: copy("Ara", "Search"),
    new: copy("Yeni oturum", "New session"),
    back: copy("Geri", "Back"),
    tabs: copy("Sekmeler", "Tabs"),
    settings: copy("Ayarlar", "Settings"),
    shortcuts: copy("Klavye kısayolları", "Keyboard shortcuts"),
    close: copy("Açık sayfayı kapat", "Close the open sheet"),
  };
  return <Sheet visible title={copy("Klavye kısayolları", "Keyboard shortcuts")} onClose={onClose} size="compact">
    <View style={{ gap: space.sm }}>
      {SHORTCUTS.map(({ id, keys }) => (
        <View key={id} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
          <Body style={{ flexShrink: 1 }}>{titles[id]}</Body>
          <Body muted>{keys}</Body>
        </View>
      ))}
    </View>
  </Sheet>;
}
