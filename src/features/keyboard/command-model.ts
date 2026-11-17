import type { PaletteEntry } from "./keyboard-model";

type Copy = (tr: string, en: string) => string;

/** The fixed app destinations. The command palette and the tablet quick panel both read this list. */
export function appCommands(copy: Copy): PaletteEntry[] {
  return [
    { id: "new", label: copy("Yeni oturum", "New session"), kind: "action", destination: { pathname: "/sessions", params: { new: "1" } } },
    { id: "computers", label: copy("Bilgisayarlar", "Computers"), kind: "action", destination: { pathname: "/machines" } },
    { id: "settings", label: copy("Ayarlar", "Settings"), kind: "setting", destination: { pathname: "/(tabs)/settings" } },
    { id: "account", label: copy("Hesap", "Account"), kind: "setting", destination: { pathname: "/account" } },
    { id: "tools", label: copy("Araçlar", "Tools"), kind: "tool", destination: { pathname: "/(tabs)/manage" } },
    ...([
      ["terminals", copy("Terminaller", "Terminals")],
      ["logs", copy("Çalışma günlükleri", "Runtime logs")],
      ["usage", copy("Oturum kullanımı", "Session usage")],
      ["providers", copy("Sağlayıcı merkezi", "Provider center")],
      ["access", copy("Bilgisayar erişimi", "Host access")],
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
