import { useEffect, useMemo, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import type { TerminalViewportHandle } from "@/ui/terminal-viewport";
import type { TerminalPacket } from "@/ui/terminal-document";
import { useMobileTheme } from "@/ui/theme";
import { terminalAnsiPalettes } from "@/ui/tokens";
import { createTerminalUtf8Reader, terminalBase64Utf8, terminalKeyInput, withTerminalModifiers, type TerminalBarKey } from "./terminal-keys";
import { useTerminalModifiers } from "./use-terminal-modifiers";

/** Characters per output packet: at most 24 KB of UTF-8, inside the document's 44,000-character base64 limit. */
const OUTPUT_CHUNK = 8000;
const ANSI_NAMES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;
/** Marks where output older than the retained tail was cut. */
const GAP_MARK = "\u001b[0m\u001b[2m…\u001b[0m\r\n";

type Session = {
  read: (base64: string) => string;
  queue: string;
  waiting: boolean;
  sequence: number;
  /** Host output cursor already queued for the document. */
  shown: number;
  /** The retained output was replayed; from now on the document answers the PTY's own queries. */
  live: boolean;
};

/** The xterm.js colours for the current app appearance; both terminals use it. */
export function useTerminalTheme() {
  const { mode, colors } = useMobileTheme();
  return useMemo(() => {
    const palette = terminalAnsiPalettes[mode];
    const ansi: Record<string, string> = {};
    ANSI_NAMES.forEach((name, index) => {
      ansi[name] = palette[index]!;
      ansi[`bright${name[0]!.toUpperCase()}${name.slice(1)}`] = palette[index + 8]!;
    });
    return {
      background: colors.background, foreground: colors.text, cursor: colors.accent, cursorAccent: colors.background,
      selectionBackground: colors.selected, ...ansi,
    };
  }, [mode, colors.background, colors.text, colors.accent, colors.selected]);
}

/**
 * Connects one PTY terminal to the xterm.js document: replays and follows the Host output and
 * forwards every keystroke, key-bar key, paste and size change to the PTY unchanged. The shell owns
 * echo, prompt, line editing and completion; the owner keeps the Host writes.
 */
export function useTerminalConsole({ output, enabled, onInput, onResize }: {
  output: { output: string; cursor: number } | undefined;
  /** Typing is accepted: the terminal runs, the connection may write and no result is uncertain. */
  enabled: boolean;
  /** Raw bytes for the PTY, in typing order. */
  onInput: (data: string) => void;
  /** The fitted grid size of the visible terminal. */
  onResize: (cols: number, rows: number) => void;
}) {
  const theme = useTerminalTheme();
  const viewport = useRef<TerminalViewportHandle>(null);
  const [nonce, setNonce] = useState(randomUUID);
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState(false);
  const sticky = useTerminalModifiers();
  const activeRef = useRef(false);
  const session = useRef<Session | null>(null);
  const latest = useRef({ output, onInput, onResize });
  latest.current = { output, onInput, onResize };

  const flush = () => {
    const current = session.current;
    if (!current || current.waiting) return;
    if (!current.queue) {
      // Live only after the first Host read was replayed: a document ready before the output
      // arrives must not answer queries inside the history that follows as typed input.
      if (!current.live && latest.current.output !== undefined) {
        current.live = true;
        setLive(true);
      }
      return;
    }
    let size = Math.min(OUTPUT_CHUNK, current.queue.length);
    const last = current.queue.charCodeAt(size - 1);
    if (size < current.queue.length && last >= 0xd800 && last <= 0xdbff) size--;
    const chunk = current.queue.slice(0, size);
    current.queue = current.queue.slice(size);
    current.waiting = true;
    viewport.current?.post({ type: "output", after: current.sequence, next: current.sequence + 1, dataBase64: terminalBase64Utf8(chunk) });
  };
  const sync = () => {
    const current = session.current;
    const data = latest.current.output;
    if (!current || !data || data.cursor <= current.shown) {
      flush();
      return;
    }
    const fresh = data.cursor - current.shown;
    // Output older than the retained tail is gone; mark where it was cut.
    current.queue += fresh > data.output.length ? GAP_MARK + data.output : data.output.slice(data.output.length - fresh);
    current.shown = data.cursor;
    flush();
  };
  const write = (data: string) => {
    if (data && activeRef.current) latest.current.onInput(data);
  };
  // Typed input takes the armed sticky modifiers.
  const send = (data: string) => {
    if (data && activeRef.current) write(withTerminalModifiers(data, sticky.take()));
  };

  const onPacket = (packet: TerminalPacket) => {
    if (packet.type === "ready") {
      session.current = { read: createTerminalUtf8Reader(), queue: "", waiting: false, sequence: 0, shown: 0, live: false };
      setLive(false);
      setReady(true);
      latest.current.onResize(packet.cols!, packet.rows!);
      sync();
      return;
    }
    const current = session.current;
    if (!current) return;
    if (packet.type === "ack") {
      if (current.waiting && packet.next === current.sequence + 1) {
        current.sequence = packet.next;
        current.waiting = false;
        flush();
      }
    } else if (packet.type === "resize") latest.current.onResize(packet.cols!, packet.rows!);
    else if (packet.type === "input") send(current.read(packet.dataBase64!));
  };
  // A crashed or reloaded web view starts a fresh document that replays the retained output.
  const onLost = () => {
    session.current = null;
    setReady(false);
    setLive(false);
    setNonce(randomUUID());
  };

  useEffect(() => { if (ready) sync(); }, [ready, output?.output, output?.cursor]);
  // Replies to queries inside replayed history would reach the shell as typed input; the
  // document takes keys only once it shows the live output.
  const active = enabled && live;
  activeRef.current = active;
  useEffect(() => {
    if (ready) viewport.current?.post({ type: "configure", active, freshPty: false, theme });
  }, [ready, active, theme, nonce]);

  const sendKey = (key: TerminalBarKey) => {
    if (activeRef.current) write(terminalKeyInput(key, sticky.take()));
  };
  /** Pasted text goes in as given, without the sticky modifiers (see `pasteIntoTerminal`). */
  const paste = (text: string) => {
    if (activeRef.current) write(text);
  };
  return {
    viewport, nonce, ready: ready && live, modifiers: sticky.modifiers, onPacket, onLost, sendKey, paste,
    toggleModifier: sticky.toggle,
    focusInput: () => viewport.current?.focusInput(),
    hideInput: () => viewport.current?.hideInput(),
  };
}
