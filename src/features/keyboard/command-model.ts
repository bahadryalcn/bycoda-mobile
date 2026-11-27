import type { PaletteEntry } from "./keyboard-model";
import { NEW_CHAT_ROUTE_ID } from "../workspace/new-chat-model";

type Copy = (tr: string, en: string) => string;

/** The fixed app destinations. The command palette and the tablet quick panel both read this list. */
export function appCommands(copy: Copy): PaletteEntry[] {
  return [
    // The empty new session (`/session/new`), addressed through the typed dynamic route.
    { id: "new", label: copy("Yeni oturum", "New session"), kind: "action", destination: { pathname: "/session/[id]", params: { id: NEW_CHAT_ROUTE_ID } } },
    { id: "computers", label: copy("Bilgisayarlar", "Computers"), kind: "action", destination: { pathname: "/machines" } },
    { id: "settings", label: copy("Ayarlar", "Settings"), kind: "setting", destination: { pathname: "/(tabs)/settings" } },
    { id: "account", label: copy("Hesap", "Account"), kind: "setting", destination: { pathname: "/account" } },
    { id: "tools", label: copy("Araçlar", "Tools"), kind: "tool", destination: { pathname: "/(tabs)/manage" } },
    ...([
      ["terminals", copy("Terminaller", "Terminals")],
      ["usage", copy("Oturum kullanımı", "Session usage")],
      ["providers", copy("Sağlayıcı merkezi", "Provider center")],
      ["access", copy("Bilgisayar erişimi", "Computer access")],
      ["devices", copy("Cihazlar", "Devices")],
    ] as const).map(([tool, label]): PaletteEntry => ({
      id: `tool:${tool}`,
      label,
      kind: "tool",
      destination: { pathname: "/tools/[tool]", params: { tool } },
    })),
  ];
}

export function findCommand(commands: readonly PaletteEntry[], id: string): PaletteEntry | undefined {
  return commands.find((command) => command.id === id);
}
