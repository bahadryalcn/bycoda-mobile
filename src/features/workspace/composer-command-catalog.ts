import type { useCopy } from "@/ui/copy";
import type { RemoteProvider } from "./wire";
import type { ComposerSuggestion } from "./composer-catalog-model";

/** Commands the phone opens itself instead of inserting text: each has a mobile destination. */
export type ComposerNavigationAction = "new-session" | "resume" | "move-to-folder";
const NAVIGATION_ACTIONS: Partial<Record<string, ComposerNavigationAction>> = {
  new: "new-session",
  resume: "resume",
  "add-to-folder": "move-to-folder",
};

export function isComposerNavigationAction(action: ComposerSuggestion["action"]): action is ComposerNavigationAction {
  return action === "new-session" || action === "resume" || action === "move-to-folder";
}

export function composerBuiltins(
  copy: ReturnType<typeof useCopy>,
  harness: RemoteProvider,
  capabilities?: readonly string[],
  /** The session belongs to a project: history import and folders are project-scoped. */
  context: { project: boolean } = { project: false },
): ComposerSuggestion[] {
  const desktop = copy("Masaüstünde kullanılabilir", "Available on desktop");
  // Same capability as the session's own "Move to folder" action.
  const folders = context.project && !!capabilities?.includes("projects.organization.desktop.v1");
  const rows: Array<[string, string, string?]> = [
    ["compact", copy("Yer açmak için eski oturum bağlamını özetle.", "Summarize older session context to free space.")],
    ["plan", copy("Dosyaları değiştirmeden önce incelenebilir bir uygulama planı oluştur.", "Create a reviewable implementation plan before changing files.")],
    ["draft", copy("Ajanı başlatmadan bu mesajı kaydet.", "Save this message without starting the agent.")],
    ["new", copy("Yeni oturum", "New session")],
    ["clear", copy("Oturumu temizle", "Clear session"), desktop],
    ["add-to-folder", copy("Oturumu kenar çubuğunda mevcut veya yeni bir klasöre taşı.", "Place this session in an existing or new sidebar folder."), folders ? undefined : desktop],
    ["mcp", copy("Bu mesaj için bir MCP sunucusu bul.", "Find an MCP server for this message."), desktop],
    ["operator", copy("Bu oturuma bycoda oturumları, klasörleri ve notlarına erişim ver.", "Give this thread access to bycoda sessions, folders, and notes."), desktop],
    ["orchestrator", copy("Ajanların işini planla ve koordine et.", "Plan and coordinate agent work."), desktop],
    ["subagents", copy("Bu isteği paralel alt ajanlara böl.", "Split this request across parallel subagents."), desktop],
    ["task", copy("Bu isteği bycoda görevlerine dönüştür.", "Turn this request into bycoda tasks."), desktop],
    ["epic", copy("Bu isteği bir epik olarak planla.", "Plan this request as an Epic."), desktop],
    ["crew", copy("Bu isteği bir ekip liderine gönder.", "Send this request to a Crew lead."), desktop],
    ["automation", copy("Bu isteği otomasyon olarak zamanla.", "Schedule this request as an automation."), desktop],
  ];
  if (harness === "claude" || harness === "codex") {
    rows.push(
      ["btw", copy("Mevcut tur hakkında salt okunur bir yan soru sor.", "Ask a read-only side question about the current turn."),
        capabilities?.includes("sessions.sideQuestion") ? undefined : desktop],
      ["resume", copy("Bu projede bir Claude Code veya Codex oturumunu içe aktar ve sürdür.", "Import and continue a Claude Code or Codex session in this project."),
        context.project ? undefined : desktop],
    );
  }
  return rows.map(([name, detail, unavailable]) => {
    const navigation = unavailable ? undefined : NAVIGATION_ACTIONS[name];
    return {
      id: `app:${name}`, name, detail, unavailable, label: name, kind: "command", group: "commands",
      ...(name === "btw" ? { action: "side-question" } : navigation ? { action: navigation } : {}),
    };
  });
}
