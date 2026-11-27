import { useRef, useState } from "react";
import { NO_TERMINAL_MODIFIERS, type TerminalModifier, type TerminalModifiers } from "./terminal-keys";

/**
 * The key bar's sticky one-shot Ctrl and Alt. `take` hands the armed modifiers to the next key or
 * typed input and disarms them; a ref keeps that exact when several inputs arrive before a render.
 */
export function useTerminalModifiers() {
  const [modifiers, setModifiers] = useState<TerminalModifiers>(NO_TERMINAL_MODIFIERS);
  const armed = useRef<TerminalModifiers>(NO_TERMINAL_MODIFIERS);
  const set = (next: TerminalModifiers) => {
    armed.current = next;
    setModifiers(next);
  };
  return {
    modifiers,
    toggle: (modifier: TerminalModifier) => set({ ...armed.current, [modifier]: !armed.current[modifier] }),
    take: (): TerminalModifiers => {
      const current = armed.current;
      if (current.ctrl || current.alt) set(NO_TERMINAL_MODIFIERS);
      return current;
    },
    isArmed: () => armed.current.ctrl || armed.current.alt,
  };
}
