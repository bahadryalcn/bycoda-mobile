import { useEffect, useState } from "react";
import { View } from "react-native";
import { KeyboardAvoidingView, useKeyboardState, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Search from "lucide-react-native/icons/search";
import Square from "lucide-react-native/icons/square";
import Trash2 from "lucide-react-native/icons/trash-2";
import { useSecurity } from "@/state/security";
import { useMobileTheme } from "@/ui/theme";
import { ScreenOverlay } from "@/ui/overlays";
import { ScreenFrameInsets } from "@/ui/screen-content-insets";
import {
  ActionMenu,
  Body,
  Disclosure,
  Button,
  ErrorText,
  HeaderBackButton,
  Heading,
  IconButton,
  FormActions,
  NavigationRow,
  Loading,
  Notice,
  Row,
  SearchField,
  Sheet,
  Stack,
  StateView,
  StatusLine,
  ScreenList,
  showToast,
} from "@/ui/primitives";
import { TerminalViewport } from "@/ui/terminal-viewport";
import { useCopy } from "@/ui/copy";
import { iconSize, metrics, space } from "@/ui/tokens";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import type { SessionScope } from "../workspace/session-types";
import { isPtyDesktopOffline, ptyRecoveryMessage } from "./mobile-pty-error";
import { ptyInput, ptyModifiedInput } from "./mobile-pty-model";
import { TerminalKeyBar } from "./terminal-key-bar";
import { pasteIntoTerminal } from "./terminal-paste";
import { terminalKeyInput } from "./terminal-keys";
import { useTerminalModifiers } from "./use-terminal-modifiers";
import { useMobilePtySession } from "./use-mobile-pty-session";
import { attachTerminalOutput } from "./mobile-pty-attach";
import { TerminalCopyButton, TerminalPickerSheet, TerminalPill } from "./terminal-header-controls";
import { terminalClosedLabel, terminalShellName, terminalStateLabel } from "./terminal-model";
import { TerminalOutputView } from "./terminal-output-view";

const PTY_HISTORY_LINES = 2000;

export function MobilePty({
  scope,
  projectId,
  onClose,
}: {
  scope: SessionScope;
  projectId: string;
  onClose: () => void;
}) {
  const copy = useCopy();
  const title = copy("Terminal", "Terminal");
  const insets = useSafeAreaInsets();
  const { colors, uiStyles } = useMobileTheme();
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const { progress } = useReanimatedKeyboardAnimation();
  // The home-indicator inset is replaced by the IME while it is open, as in SessionKeyboardFrame.
  const safeBottomStyle = useAnimatedStyle(
    () => ({ paddingBottom: insets.bottom * (1 - Math.min(1, Math.max(0, progress.value))) }),
  );
  const [readyNonce, setReadyNonce] = useState<string | null>(null);
  const [attachedNonce, setAttachedNonce] = useState<string | null>(null);
  const [outputError, setOutputError] = useState<{ nonce: string; error: unknown } | null>(null);
  const [closeReview, setCloseReview] = useState<string>();
  const [search, setSearch] = useState<{ nonce: string; text: string; query: string }>();
  const [picking, setPicking] = useState(false);
  // Briefly disable reattaching the same output while the confirmation is displayed.
  useEffect(() => {
    if (!attachedNonce) return;
    const timer = setTimeout(() => setAttachedNonce(null), 2000);
    return () => clearTimeout(timer);
  }, [attachedNonce]);
  const session = useMobilePtySession({ scope, projectId });
  const {
    lease,
    attempt,
    createFailed,
    busy,
    pendingAction,
    controlsDisabled,
    closePending,
    paused,
    gap,
    lost,
    nonce,
    viewport,
    canInterrupt,
    showTerminal,
    create,
    attach,
    interrupt,
    sendKey,
    checkCreation,
    closeTerminal,
    clearFailedCreation,
    markLost,
    onPacket,
  } = session;
  // Sticky Ctrl/Alt from the shared key bar: the next key-bar key or typed character takes them; paste stays text.
  const sticky = useTerminalModifiers();
  const sendText = (text: string) => {
    if (text) sendKey(ptyInput(text));
  };
  const terminalOpen = !!(showTerminal && lease);
  const searchOpen = terminalOpen && search?.nonce === nonce ? search : undefined;
  // A closed terminal cannot be attached again, so the list and tabs show only running ones.
  const runningTerminals = session.terminals.filter(entry => entry.state === "running");
  const tabs = lease && !runningTerminals.some(entry => entry.terminalId === lease.terminal.terminalId)
    ? [...runningTerminals, lease.terminal] : runningTerminals;
  const clipboard = useClipboardFeedback(nonce, terminalOpen, undefined,
    async () => {
      const output = session.recentOutput(PTY_HISTORY_LINES);
      if (!output) throw new Error(copy("Henüz çıktı yok.", "No output yet."));
      return output;
    });
  const desktopOffline = isPtyDesktopOffline(session.listError);
  const terminalError = desktopOffline && session.error === session.listError ? null : session.error;
  const recovery = ptyRecoveryMessage(terminalError, copy);
  const webReady = readyNonce === nonce;
  const failure = (
    <>
      {session.unavailable ? (
        <StateView
          illustration={session.unavailable === "unsupported" ? "permission" : "unreachable"}
          title={session.unavailable === "unsupported" ? copy("Güncelleme gerekiyor", "Update needed") : copy("Bağlantı bekleniyor", "Waiting for a connection")}
          description={session.unavailable === "no-computer" ? copy(
            "Önce bir bilgisayara bağlanın, ardından terminali yeniden açın.",
            "Connect a computer first, then reopen the terminal.",
          ) : session.unavailable === "changed" ? copy(
            "Bilgisayar bağlantısı değişti. Doğru bilgisayarı seçip terminali yeniden açın.",
            "The computer connection changed. Select the correct computer and reopen the terminal.",
          ) : session.unavailable === "no-identity" ? copy(
            "Bilgisayar kimliği alınamadı. Bilgisayar bağlantısını yenileyip terminali yeniden açın.",
            "The computer identity is unavailable. Refresh the computer connection and reopen the terminal.",
          ) : copy(
            "Bu bilgisayar etkileşimli masaüstü terminalini desteklemiyor.",
            "This computer does not support the interactive desktop terminal.",
          )}
        />
      ) : null}
      {/* One state at a time: an unavailable terminal owns the region, so nothing else stacks under it. */}
      {!session.unavailable && desktopOffline ? (
        <StateView
          size="compact"
          tone="warning"
          title={copy("Masaüstü uygulamasına ulaşılamıyor", "Desktop app unavailable")}
          description={copy("Bağlı bilgisayarda bycoda’yı aç, ardından yeniden dene.", "Open bycoda on the connected computer, then retry.")}
          action={session.retryList ? {
            label: copy("Yeniden dene", "Retry"),
            onPress: session.retryList,
            busy: session.listRefreshing,
            reserveTouchTarget: true,
          } : undefined}
        />
      ) : null}
      {session.unavailable ? null : <><ErrorText error={terminalError} message={recovery ?? copy(
        "Terminal işlemi tamamlanamadı. Bağlantıyı kontrol edin; ayrıntıları aşağıda görebilirsiniz.",
        "The terminal action could not complete. Check the connection; details are available below.",
      )} />
      {terminalError && !recovery ? <Disclosure label={copy("Hata ayrıntıları", "Error details")}>
        <ErrorText error={terminalError} />
      </Disclosure> : null}
      {gap || lost ? (
        <Notice
          tone="warning"
          message={copy(
            "Terminal ekran durumu kayboldu. Çıktı eksikse yeni terminali açıkça oluşturun.",
            "Terminal screen state was lost. If output is missing, explicitly create a fresh terminal.",
          )}
        />
      ) : null}</>}
    </>
  );
  const leave = () => {
    session.pause();
    onClose();
  };
  const outputAttached = attachedNonce === nonce;
  const attachOutput = () => {
    if (outputAttached) return;
    try {
      attachTerminalOutput(scope, session.recentOutput, copy("Eklenecek terminal çıktısı henüz yok.", "There is no terminal output to attach yet."));
      setOutputError(null);
      setAttachedNonce(nonce);
      showToast({ message: copy("Taslağa eklendi", "Added to draft") });
    } catch (error) {
      setOutputError({ nonce, error });
    }
  };
  // Keep the terminal and its action sheet in the same activity and lock boundary.
  if (!unlocked) return null;

  return (
    <ScreenOverlay visible label={title} onClose={leave}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
        <Animated.View style={[{ flex: 1, paddingTop: insets.top }, safeBottomStyle]}>
          <View style={{ flexDirection: "row", alignItems: "center", minHeight: metrics.touchTarget, paddingLeft: insets.left, paddingRight: insets.right }}>
            <HeaderBackButton onPress={leave} />
            <View style={{ flex: 1 }}>
              <Heading numberOfLines={1}>{title}</Heading>
              {session.machineName ? <Body muted numberOfLines={1}>{session.machineName}</Body> : null}
            </View>
            {terminalOpen ? <>
              <IconButton label={copy("Çıktıda ara", "Search output")} expanded={!!searchOpen} reserveTouchTarget
                onPress={() => {
                  if (keyboardVisible) viewport.current?.hideInput();
                  setSearch(searchOpen ? undefined : { nonce, text: session.recentOutput(PTY_HISTORY_LINES), query: "" });
                }}>
                <Search size={iconSize.action} color={searchOpen ? colors.accent : colors.muted} />
              </IconButton>
              <TerminalCopyButton clipboard={clipboard} />
            </> : null}
            {(terminalOpen || session.listReady) ? <ActionMenu
              label={copy("Terminal işlemleri", "Terminal actions")}
              busy={busy}
              reserveTouchTarget
              onTriggerPress={() => {
                if (keyboardVisible) viewport.current?.hideInput();
              }}
              actions={[
                terminalOpen && { key: "interrupt", label: copy("Ctrl+C gönder", "Send Ctrl+C"),
                  detail: copy("Çalışan programı durdurur. Kabuk açık kalır.", "Stops the running program. The shell stays open."),
                  icon: <Square size={iconSize.row} color={colors.muted} />, disabled: !canInterrupt || busy, onPress: interrupt },
                terminalOpen && { key: "attach-output", label: outputAttached ? copy("Taslağa eklendi", "Added to draft") : copy("Çıktıyı ekle", "Attach output"),
                  disabled: outputAttached, onPress: attachOutput },
                terminalOpen && { key: "list", label: copy("Terminaller", "Terminals"), disabled: closePending || busy, onPress: session.detach },
                terminalOpen && { key: "close", label: closePending ? copy("Durumu kontrol et", "Check status") : copy("Terminali kapat", "Close terminal"), destructive: !closePending,
                  icon: closePending ? undefined : <Trash2 size={iconSize.row} color={colors.danger} />, disabled: controlsDisabled,
                  onPress: closePending ? closeTerminal : () => setCloseReview(nonce) },
              ]}
            /> : null}
          </View>
      {terminalOpen && lease ? (
        <View style={{ flex: 1, paddingLeft: insets.left, paddingRight: insets.right }}>
          {/* The same pill and picker as the terminal tool: switching and creating live in one sheet. */}
          <Row style={{ paddingHorizontal: space.screen, paddingBottom: space.xs }}>
            <TerminalPill terminal={lease.terminal} expanded={picking}
              onPress={() => { viewport.current?.hideInput(); setPicking(true); }} />
            <Body mono muted numberOfLines={1} ellipsizeMode="middle" style={[uiStyles.caption, uiStyles.grow]}>{terminalShellName(lease.terminal.shell)}</Body>
          </Row>
          {terminalError || gap || lost ? <Stack>{failure}</Stack> : null}
          {session.exited && !terminalError ? <View style={{ paddingHorizontal: space.screen }}>
            <StatusLine tone={session.exited.exitCode ? "warning" : "info"} label={terminalClosedLabel(session.exited.exitCode, copy)} />
          </View> : null}
          {outputError?.nonce === nonce ? <Stack><ErrorText error={outputError.error} /></Stack> : null}
          <ErrorText error={clipboard.error} />
          {searchOpen ? <View style={{ paddingHorizontal: space.screen, paddingBottom: space.xs }}>
            <SearchField label={copy("Çıktıda ara", "Search output")} value={searchOpen.query} maxLength={200}
              onChangeText={query => setSearch({ ...searchOpen, query })} />
          </View> : null}
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <TerminalViewport ref={viewport} nonce={nonce} onPacket={(packet) => {
              if (packet.type === "ready") setReadyNonce(nonce);
              if (packet.type === "input" && packet.dataBase64 && sticky.isArmed())
                onPacket({ ...packet, dataBase64: ptyModifiedInput(packet.dataBase64, sticky.take()) });
              else onPacket(packet);
            }} onLost={markLost} />
            {!webReady ? (
              <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
                <Loading centered label={copy("Terminal açılıyor…", "Opening terminal…")} />
              </View>
            ) : null}
            {searchOpen ? <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>
              <TerminalOutputView output={searchOpen.text} query={searchOpen.query} />
            </View> : null}
          </View>
          {paused && !session.exited ? (
            <View style={{ alignItems: "flex-start", paddingHorizontal: space.screen, paddingTop: space.xs }}>
              <Button label={copy("Sürdür", "Resume")} density="compact" tone="secondary" reserveTouchTarget
                busy={busy && pendingAction === "resume"} disabled={controlsDisabled || closePending}
                onPress={() => attach(lease.terminal, "resume")} />
            </View>
          ) : null}
          {searchOpen ? null : (
            <View style={{ paddingHorizontal: space.screen, paddingVertical: space.sm, backgroundColor: colors.background }}>
              <TerminalKeyBar disabled={!canInterrupt} modifiers={sticky.modifiers} keyboardVisible={keyboardVisible}
                onKey={(key) => sendText(terminalKeyInput(key, sticky.take()))} onToggleModifier={sticky.toggle}
                onPaste={() => { void pasteIntoTerminal(copy, sendText); }}
                onToggleKeyboard={() => keyboardVisible ? viewport.current?.hideInput() : viewport.current?.focusInput()} />
            </View>
          )}
        </View>
      ) : (
        <ScreenFrameInsets value><ScreenList
          data={runningTerminals}
          keyExtractor={(terminal) => terminal.terminalId}
          header={
            <Stack>
              {failure}
              {!session.unavailable && !desktopOffline && session.listError && session.retryList ? (
                <Button tone="quiet" label={copy("Yeniden dene", "Retry")} busy={session.listRefreshing}
                  reserveTouchTarget onPress={session.retryList} />
              ) : null}
              {session.listLoading && !session.listError ? <Loading delayed label={copy("Terminaller yükleniyor…", "Loading terminals…")} /> : session.listWaiting ? (
                <StatusLine busy label={copy(
                  "Bağlantı bekleniyor. Bağlantı geri geldiğinde yeniden denenecek.",
                  "Waiting for a connection. Loading will resume when it returns.",
                )} />
              ) : session.listReady ? <Button
                label={copy("Yeni etkileşimli terminal", "New interactive terminal")}
                busy={busy && pendingAction === "primary"}
                disabled={controlsDisabled || !!attempt}
                onPress={create}
              /> : null}
              {/* One primary action: a pending creation is recovered quietly, never beside a second create. */}
              {attempt && !createFailed ? (
                <Button busy={busy && pendingAction === "secondary-1"} tone="quiet"
                  label={copy("Durumu denetle", "Check status")}
                  disabled={controlsDisabled}
                  onPress={checkCreation}
                />
              ) : null}
              {createFailed && attempt ? (
                <Button busy={busy && pendingAction === "secondary-3"} tone="quiet"
                  label={copy("Temizle", "Clear")}
                  disabled={controlsDisabled}
                  onPress={clearFailedCreation}
                />
              ) : null}
            </Stack>
          }
          renderItem={({ item: terminal }) => (
            <NavigationRow
              label={terminal.name}
              busy={busy && pendingAction === `attach:${terminal.terminalId}`}
              detail={terminalStateLabel(terminal.state === "running", copy)}
              disabled={controlsDisabled || terminal.state !== "running"}
              onPress={() => attach(terminal)}
            />
          )}
        /></ScreenFrameInsets>
      )}
          <TerminalPickerSheet visible={terminalOpen && picking}
            terminals={tabs.map(entry => ({ id: entry.terminalId, name: entry.name, shell: entry.shell, state: entry.state }))}
            selectedId={lease?.terminal.terminalId} disabled={controlsDisabled || closePending}
            canCreate={session.listReady && !controlsDisabled && !closePending && !attempt}
            onSelect={(id) => {
              setPicking(false);
              const entry = tabs.find(item => item.terminalId === id);
              if (entry && entry.terminalId !== lease?.terminal.terminalId) attach(entry);
            }}
            onCreate={() => { setPicking(false); create(); }}
            onClose={() => setPicking(false)} />
          <Sheet visible={terminalOpen && closeReview === nonce}
            title={copy("Terminali kapat", "Close terminal")} size="compact" onClose={() => setCloseReview(undefined)}>
            <Body mono>{lease?.terminal.name}</Body>
            <Notice tone="warning" message={copy("Bu terminalin kabuğu ve çalışan alt işlemleri sonlandırılacak.", "This terminal's shell and running child processes will end.")} />
            <FormActions submitLabel={copy("Terminali kapat", "Close terminal")} tone="danger" disabled={controlsDisabled}
              onCancel={() => setCloseReview(undefined)} onSubmit={() => {
                setCloseReview(undefined);
                closeTerminal();
              }} />
          </Sheet>
        </Animated.View>
      </KeyboardAvoidingView>
    </ScreenOverlay>
  );
}
