/** Host tool names shared by the Tools directory, the route title and each tool screen. */
const labels = {
  terminals: ["Terminaller", "Terminals"],
  servers: ["Geliştirme sunucuları", "Dev servers"],
  logs: ["Çalışma günlükleri", "Runtime logs"],
  devices: ["Cihazlar", "Devices"],
  browser: ["Tarayıcı", "Browser"],
  diagnostics: ["Bilgisayar kaynakları", "Computer resources"],
  usage: ["Kullanım ve limitler", "Usage and limits"],
  providers: ["Sağlayıcı merkezi", "Provider center"],
  access: ["Bilgisayar erişimi", "Host access"],
} satisfies Record<string, readonly [tr: string, en: string]>;

export type ToolId = keyof typeof labels;
export const toolLabels: Readonly<Record<ToolId, readonly [tr: string, en: string]>> = labels;

/** Tools that read computer-level data and open without a project. */
export const computerTools: ReadonlySet<string> = new Set<ToolId>(["usage", "diagnostics"]);

export function isToolId(tool: string): tool is ToolId {
  return Object.hasOwn(toolLabels, tool);
}
