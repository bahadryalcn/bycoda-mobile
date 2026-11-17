import { useState, type PropsWithChildren } from "react";
import { router, type Href } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useKeyCommand } from "../../../modules/bycoda-key-commands";
import { useCopy } from "@/ui/copy";
import { useSecurity, isAppContentVisible } from "@/state/security";
import { usePrivateContentAllowed } from "@/ui/private-access";
import { TAB_ROUTES } from "./keyboard-model";
import { CommandPalette } from "./command-palette";
import { ShortcutsSheet } from "./shortcuts-sheet";
import { KeyboardContext, useCommandPalette } from "./keyboard-context";
export { useCommandPalette } from "./keyboard-context";

/** Mount inside the existing account, consent and security gates. */
export function KeyboardCommandsProvider({ children }: PropsWithChildren) {
  const [visible, setVisible] = useState(false);
  return <KeyboardContext value={{ visible, open: () => setVisible(true), close: () => setVisible(false) }}>{children}</KeyboardContext>;
}

/** Stack screenLayout supplies route focus, query authority and private-content context. */
export function KeyboardScreen({ children }: PropsWithChildren) {
  const copy = useCopy();
  const palette = useCommandPalette();
  const [shortcuts, setShortcuts] = useState(false);
  const focused = useIsFocused();
  const allowed = usePrivateContentAllowed();
  const unlocked = useSecurity((state) => state.status === "unlocked" && state.appState === "active");
  const enabled = focused && allowed && unlocked && isAppContentVisible();
  const navigate = (destination: string) => { if (!isAppContentVisible()) return; palette.close(); router.navigate(destination as Href); };
  useKeyCommand({ key: "k", primary: true, title: copy("Komut paleti", "Command palette"), enabled }, palette.open);
  useKeyCommand({ key: "f", primary: true, title: copy("Ara", "Search"), enabled }, palette.open);
  useKeyCommand({ key: ",", primary: true, title: copy("Ayarlar", "Settings"), enabled }, () => navigate(TAB_ROUTES[4]));
  useKeyCommand({ key: "/", primary: true, title: copy("Klavye kısayolları", "Keyboard shortcuts"), enabled }, () => setShortcuts(true));
  useKeyCommand({ key: "n", primary: true, title: copy("Yeni oturum", "New session"), enabled }, () => navigate("/sessions?new=1"));
  useKeyCommand({ key: "[", primary: true, title: copy("Geri", "Back"), enabled }, () => {
    if (palette.visible) palette.close(); else if (router.canGoBack()) router.back();
  });
  // Stable hook order; fixed five destination shortcuts are independent of tab visibility/order.
  useKeyCommand({ key: "1", primary: true, title: copy("Projeler", "Projects"), enabled }, () => navigate(TAB_ROUTES[0]));
  useKeyCommand({ key: "2", primary: true, title: copy("Sohbetler", "Chats"), enabled }, () => navigate(TAB_ROUTES[1]));
  useKeyCommand({ key: "3", primary: true, title: copy("Gelen kutusu", "Inbox"), enabled }, () => navigate(TAB_ROUTES[2]));
  useKeyCommand({ key: "4", primary: true, title: copy("Yönet", "Manage"), enabled }, () => navigate(TAB_ROUTES[3]));
  useKeyCommand({ key: "5", primary: true, title: copy("Ayarlar", "Settings"), enabled }, () => navigate(TAB_ROUTES[4]));
  return <>{children}{enabled && palette.visible ? <CommandPalette onClose={palette.close} /> : null}{enabled && shortcuts ? <ShortcutsSheet onClose={() => setShortcuts(false)} /> : null}</>;
}

