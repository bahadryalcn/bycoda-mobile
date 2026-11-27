import type { ReactNode } from "react";
import { View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Loading } from "@/ui/primitives";
import { TerminalViewport } from "@/ui/terminal-viewport";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { useScreenContentInsets } from "@/ui/screen-content-insets";
import { space } from "@/ui/tokens";
import { SessionKeyboardFrame } from "../workspace/session-keyboard-frame";
import { TerminalKeyBar } from "./terminal-key-bar";
import { useTerminalConsole } from "./use-terminal-console";
import { pasteIntoTerminal } from "./terminal-paste";

type ConsoleOptions = Parameters<typeof useTerminalConsole>[0];

/**
 * One PTY terminal as a full-height terminal screen: xterm.js renders everything the shell and its
 * programs draw; the soft keyboard and the key bar (riding above the keyboard; the shared session
 * keyboard frame shrinks the terminal and the fitted size reaches the PTY) type straight into it.
 * `notices` stay above the terminal; `overlay` covers it (search and text selection).
 */
export function TerminalConsoleStage({ notices, overlay, ...options }: ConsoleOptions & { notices?: ReactNode; overlay?: ReactNode }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const insets = useScreenContentInsets();
  const safe = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const terminal = useTerminalConsole(options);
  const keys = <View style={{ paddingLeft: insets.left, paddingRight: insets.right }}>
    <TerminalKeyBar disabled={!options.enabled || !terminal.ready} modifiers={terminal.modifiers} keyboardVisible={keyboardVisible}
      onKey={terminal.sendKey} onToggleModifier={terminal.toggleModifier} onPaste={() => { void pasteIntoTerminal(copy, terminal.paste); }}
      onToggleKeyboard={() => keyboardVisible ? terminal.hideInput() : terminal.focusInput()} />
  </View>;
  return <SessionKeyboardFrame composer={overlay ? null : keys}>
    <View style={{ flex: 1, minHeight: 0, gap: space.sm }}>
      {notices ? <View style={{ paddingLeft: insets.left, paddingRight: insets.right, gap: space.sm }}>{notices}</View> : null}
      <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.background,
        paddingLeft: Math.max(safe.left, space.sm), paddingRight: Math.max(safe.right, space.sm) }}>
        <TerminalViewport key={terminal.nonce} ref={terminal.viewport} nonce={terminal.nonce} onPacket={terminal.onPacket} onLost={terminal.onLost} />
        {!terminal.ready ? (
          <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
            <Loading centered label={copy("Terminal açılıyor…", "Opening terminal…")} />
          </View>
        ) : null}
        {overlay ? <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background }}>{overlay}</View> : null}
      </View>
    </View>
  </SessionKeyboardFrame>;
}
