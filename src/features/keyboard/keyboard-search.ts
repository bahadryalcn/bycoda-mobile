import { useRef } from "react";
import type { TextInputInstance } from "react-native";
import { useKeyCommand } from "../../../modules/bycoda-key-commands";
import { useCopy } from "@/ui/copy";
import { useRouteFocus } from "@/ui/use-route-focus";
import { isAppContentVisible } from "@/state/security";
import { useCommandPalette } from "./keyboard-context";

/** Attach to the existing SearchField's native ref; keep its query/state owner. */
export function useKeyboardSearch(enabled = true) {
  const ref = useRef<TextInputInstance | null>(null);
  const focused = useRouteFocus();
  const palette = useCommandPalette();
  const copy = useCopy();
  useKeyCommand({ key: "f", primary: true, title: copy("Ara", "Search"), enabled: enabled && focused && !palette.visible }, () => {
    if (isAppContentVisible()) ref.current?.focus();
  });
  return ref;
}
