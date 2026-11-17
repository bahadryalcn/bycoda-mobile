import { findCommand } from "../keyboard/command-model";
import type { PaletteEntry } from "../keyboard/keyboard-model";
import type { QuickActionSession } from "../widgets/model/quick-actions";
import type { HingeGap } from "@/ui/adaptive-layout-model";

type Copy = (tr: string, en: string) => string;

export const QUICK_PANEL_RECENTS = 3;
export const QUICK_PANEL_MARGIN = 16;
export const QUICK_PANEL_WIDTH = 288;

export type QuickPanelAction =
  | { id: string; label: string; icon: "plus" | "mic" | "search" | "terminal" | "settings"; kind: "route"; destination: PaletteEntry["destination"] }
  | { id: string; label: string; icon: "mic"; kind: "voice"; href: string }
  | { id: string; label: string; icon: "search"; kind: "palette" }
  | { id: string; label: string; icon: "message"; kind: "session"; href: string };

/** Voice assistant route, opened already listening. */
export const VOICE_HREF = "/assistant?voice=1";

export function sessionHref(session: QuickActionSession): string {
  return `/session/${encodeURIComponent(session.id)}?projectId=${encodeURIComponent(session.projectId)}&machineId=${encodeURIComponent(session.machineId)}`;
}

/** Ordered actions: create, talk, search, recent work, then the destinations used most on a tablet. */
export function quickPanelActions(
  commands: readonly PaletteEntry[],
  recents: readonly QuickActionSession[],
  copy: Copy,
): QuickPanelAction[] {
  const route = (id: string, icon: "plus" | "terminal" | "settings"): QuickPanelAction[] => {
    const command = findCommand(commands, id);
    return command ? [{ id: command.id, label: command.label, icon, kind: "route", destination: command.destination }] : [];
  };
  return [
    ...route("new", "plus"),
    { id: "voice", label: copy("Sesli asistan", "Voice"), icon: "mic", kind: "voice", href: VOICE_HREF },
    { id: "palette", label: copy("Ara ve komutlar", "Search and commands"), icon: "search", kind: "palette" },
    ...recents.slice(0, QUICK_PANEL_RECENTS).map((session): QuickPanelAction => ({
      id: `session:${session.id}`,
      label: session.title,
      icon: "message",
      kind: "session",
      href: sessionHref(session),
    })),
    ...route("tool:terminals", "terminal"),
    ...route("settings", "settings"),
  ];
}

/** Only on tablets, and never over the software keyboard. */
export function quickPanelVisible(input: { tablet: boolean; keyboardVisible: boolean }): boolean {
  return input.tablet && !input.keyboardVisible;
}

export type QuickPanelFrame = { right: number; bottom: number; maxWidth: number; maxHeight: number };

/**
 * Dock position and size limits. Insets are dp. A vertical hinge limits the width to the pane on
 * the right of it; a tabletop hinge limits the height to the area below it, so the panel never
 * overlaps the hinge band.
 */
export function quickPanelFrame(input: {
  width: number;
  height: number;
  insetRight: number;
  insetTop: number;
  bottomInset: number;
  hinge?: HingeGap;
  tabletop?: HingeGap;
}): QuickPanelFrame {
  const right = Math.max(input.insetRight, 0) + QUICK_PANEL_MARGIN;
  const bottom = Math.max(input.bottomInset, 0) + QUICK_PANEL_MARGIN;
  const leftLimit = input.hinge ? input.hinge.start + input.hinge.size : 0;
  const topLimit = input.tabletop ? input.tabletop.start + input.tabletop.size : Math.max(input.insetTop, 0);
  return {
    right,
    bottom,
    maxWidth: Math.max(0, input.width - right - leftLimit - QUICK_PANEL_MARGIN),
    maxHeight: Math.max(0, input.height - bottom - topLimit - QUICK_PANEL_MARGIN),
  };
}

/** Expanded state lives for the app session only; nothing is persisted. */
let expandedMemory = false;
export const quickPanelMemory = {
  read: () => expandedMemory,
  write(value: boolean) {
    expandedMemory = value;
  },
};
