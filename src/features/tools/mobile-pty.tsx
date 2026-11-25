import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { KeyboardAvoidingView, useKeyboardState, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Plus from "lucide-react-native/icons/plus";
import Keyboard from "lucide-react-native/icons/keyboard";
import Search from "lucide-react-native/icons/search";
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
  ChoiceChip,
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
import { darkColors, iconSize, metrics, space } from "@/ui/tokens";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import type { SessionScope } from "../workspace/session-types";
import { isPtyDesktopOffline, ptyRecoveryMessage } from "./mobile-pty-error";
import { MobilePtyBar } from "./mobile-pty-bar";
import { useMobilePtySession } from "./use-mobile-pty-session";
import { attachTerminalOutput } from "./mobile-pty-attach";
import { TerminalCopyButton, TerminalStatusDot } from "./terminal-header-controls";
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
  const terminalOpen = !!(showTerminal && lease);
  const searchOpen = terminalOpen && search?.nonce === nonce ? search : undefined;
  const tabs = lease && !session.terminals.some(entry => entry.terminalId === lease.terminal.terminalId)
    ? [...session.terminals, lease.terminal] : session.terminals;
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
      attachTerminalOutput(scope, session.recentOutput);
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
            {terminalOpen && !searchOpen ? (
              <IconButton
                label={keyboardVisible ? copy("Klavyeyi gizle", "Hide keyboard") : copy("Klavyeyi göster", "Show keyboard")}
                reserveTouchTarget
                disabled={!keyboardVisible && !canInterrupt}
                onPress={() => keyboardVisible ? viewport.current?.hideInput() : viewport.current?.focusInput()}
              >
                <Keyboard size={iconSize.action} strokeWidth={2} color={colors.accent} />
              </IconButton>
            ) : null}
            {(terminalOpen || session.listReady) ? <ActionMenu
              label={copy("Terminal işlemleri", "Terminal actions")}
              busy={busy}
              reserveTouchTarget
              onTriggerPress={() => {
                if (keyboardVisible) viewport.current?.hideInput();
              }}
              actions={[
                terminalOpen && { key: "interrupt", label: "Ctrl-C", disabled: !canInterrupt || busy, onPress: interrupt },
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
          <Row style={{ paddingHorizontal: space.screen }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={uiStyles.grow}>
              <Row>{tabs.map(entry => <ChoiceChip key={entry.terminalId} label={entry.name}
                selected={entry.terminalId === lease.terminal.terminalId}
                disabled={controlsDisabled || closePending || entry.state !== "running"}
                onPress={() => {
                  if (entry.terminalId === lease.terminal.terminalId) return;
                  viewport.current?.hideInput();
                  attach(entry);
                }} />)}</Row>
            </ScrollView>
            <IconButton label={copy("Yeni etkileşimli terminal", "New interactive terminal")} reserveTouchTarget
              disabled={!session.listReady || controlsDisabled || closePending || !!attempt} onPress={create}>
              <Plus size={iconSize.action} color={colors.accent} />
            </IconButton>
          </Row>
          <Row style={{ paddingHorizontal: space.screen, paddingBottom: space.xs }}>
            <TerminalStatusDot running={lease.terminal.state === "running"} />
            <Body mono muted numberOfLines={1} ellipsizeMode="middle" style={[uiStyles.caption, uiStyles.grow]}>{lease.terminal.shell}</Body>
          </Row>
          {terminalError || gap || lost ? <Stack>{failure}</Stack> : null}
          {outputError?.nonce === nonce ? <Stack><ErrorText error={outputError.error} /></Stack> : null}
          <ErrorText error={clipboard.error} />
          {searchOpen ? <View style={{ paddingHorizontal: space.screen, paddingBottom: space.xs }}>
            <SearchField label={copy("Çıktıda ara", "Search output")} value={searchOpen.query} maxLength={200}
              onChangeText={query => setSearch({ ...searchOpen, query })} />
          </View> : null}
          <View style={{ flex: 1, backgroundColor: darkColors.background }}>
            <TerminalViewport ref={viewport} nonce={nonce} onPacket={(packet) => {
              if (packet.type === "ready") setReadyNonce(nonce);
              onPacket(packet);
            }} onLost={markLost} />
            {!webReady ? (
              <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", backgroundColor: darkColors.background }}>
                <Loading centered label={copy("Terminal açılıyor…", "Opening terminal…")} />
              </View>
            ) : null}
            {searchOpen ? <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>
              <TerminalOutputView output={searchOpen.text} query={searchOpen.query} />
            </View> : null}
          </View>
          <MobilePtyBar
            paused={paused}
            busyResume={busy && pendingAction === "resume"}
            canType={canInterrupt}
            disabled={controlsDisabled || closePending}
            onResume={() => attach(lease.terminal, "resume")}
            onKey={sendKey}
            keyboardVisible={keyboardVisible && !searchOpen}
          />
        </View>
      ) : (
        <ScreenFrameInsets value><ScreenList
          data={session.terminals}
          keyExtractor={(terminal) => terminal.terminalId}
          header={
            <Stack>
              {failure}
              {!session.unavailable && !desktopOffline && session.listError && session.retryList ? (
                <Button tone="quiet" label={copy("Yeniden dene", "Retry")} busy={session.listRefreshing}
                  reserveTouchTarget onPress={session.retryList} />
              ) : null}
              {session.listLoading ? <Loading label={copy("Terminaller yükleniyor…", "Loading terminals…")} /> : session.listWaiting ? (
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
              {attempt ? (
                <Button busy={busy && pendingAction === "secondary-1"}
                  label={copy("Oluşturma durumunu kontrol et", "Check creation status")}
                  disabled={controlsDisabled}
                  onPress={checkCreation}
                />
              ) : null}
              {createFailed && attempt ? (
                <Button busy={busy && pendingAction === "secondary-3"}
                  label={copy("Başarısız oluşturma kaydını temizle", "Clear failed creation receipt")}
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
              detail={terminal.state === "running" ? copy("Çalışıyor", "Running") : terminal.state === "exited" ? copy("Kapandı", "Exited") : terminal.state}
              disabled={controlsDisabled || terminal.state !== "running"}
              onPress={() => attach(terminal)}
            />
          )}
        /></ScreenFrameInsets>
      )}
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
