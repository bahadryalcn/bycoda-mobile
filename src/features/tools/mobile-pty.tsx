import { useEffect, useState } from "react";
import { View } from "react-native";
import { KeyboardAvoidingView, useKeyboardState, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Plus from "lucide-react-native/icons/plus";
import Keyboard from "lucide-react-native/icons/keyboard";
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
  NavigationRow,
  Loading,
  Notice,
  Stack,
  StateView,
  ScreenList,
  showToast,
} from "@/ui/primitives";
import { TerminalViewport } from "@/ui/terminal-viewport";
import { useCopy } from "@/ui/copy";
import { metrics } from "@/ui/tokens";
import type { SessionScope } from "../workspace/session-types";
import { isPtyDesktopOffline, ptyRecoveryMessage } from "./mobile-pty-error";
import { MobilePtyBar } from "./mobile-pty-bar";
import { useMobilePtySession } from "./use-mobile-pty-session";
import { attachTerminalOutput } from "./mobile-pty-attach";

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
  const { colors } = useMobileTheme();
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const { progress } = useReanimatedKeyboardAnimation();
  // The home-indicator inset is replaced by the IME while it is open, as in SessionKeyboardFrame.
  const safeBottomStyle = useAnimatedStyle(
    () => ({ paddingBottom: insets.bottom * (1 - Math.min(1, Math.max(0, progress.value))) }),
    [insets.bottom],
  );
  const [readyNonce, setReadyNonce] = useState<string | null>(null);
  const [attachedNonce, setAttachedNonce] = useState<string | null>(null);
  const [outputError, setOutputError] = useState<{ nonce: string; error: unknown } | null>(null);
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
      {desktopOffline ? (
        <StateView
          compact
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
      <ErrorText error={terminalError} message={recovery ?? copy(
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
      ) : null}
    </>
  );
  const leave = () => {
    session.pause();
    onClose();
  };
  const terminalOpen = !!(showTerminal && lease);
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
            {terminalOpen ? (
              <IconButton
                label={keyboardVisible ? copy("Klavyeyi gizle", "Hide keyboard") : copy("Klavyeyi göster", "Show keyboard")}
                reserveTouchTarget
                disabled={!keyboardVisible && !canInterrupt}
                onPress={() => keyboardVisible ? viewport.current?.hideInput() : viewport.current?.focusInput()}
              >
                <Keyboard size={22} color={colors.accent} />
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
                { key: "new", label: copy("Yeni etkileşimli terminal", "New interactive terminal"), icon: <Plus size={18} color={colors.muted} />,
                  disabled: !session.listReady || controlsDisabled || closePending || !!attempt, onPress: create },
                terminalOpen && { key: "interrupt", label: "Ctrl-C", disabled: !canInterrupt || busy, onPress: interrupt },
                terminalOpen && { key: "attach-output", label: outputAttached ? copy("Taslağa eklendi", "Added to draft") : copy("Çıktıyı ekle", "Attach output"),
                  disabled: outputAttached, onPress: attachOutput },
                terminalOpen && { key: "list", label: copy("Terminaller", "Terminals"), disabled: closePending || busy, onPress: session.detach },
                terminalOpen && { key: "close", label: closePending ? copy("Durumu kontrol et", "Check status") : copy("Terminali kapat", "Close terminal"), destructive: !closePending,
                  icon: closePending ? undefined : <Trash2 size={18} color={colors.danger} />, disabled: controlsDisabled, onPress: closeTerminal },
              ]}
            /> : null}
          </View>
      {terminalOpen && lease ? (
        <View style={{ flex: 1, paddingLeft: insets.left, paddingRight: insets.right }}>
          {terminalError || gap || lost ? <Stack>{failure}</Stack> : null}
          {outputError?.nonce === nonce ? <Stack><ErrorText error={outputError.error} /></Stack> : null}
          <View style={{ flex: 1 }}>
            <TerminalViewport ref={viewport} nonce={nonce} onPacket={(packet) => {
              if (packet.type === "ready") setReadyNonce(nonce);
              onPacket(packet);
            }} onLost={markLost} />
            {!webReady ? (
              <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
                <Loading centered label={copy("Terminal açılıyor…", "Opening terminal…")} />
              </View>
            ) : null}
          </View>
          <MobilePtyBar
            paused={paused}
            busyResume={busy && pendingAction === "resume"}
            canType={canInterrupt}
            disabled={controlsDisabled || closePending}
            onResume={() => attach(lease.terminal, "resume")}
            onKey={sendKey}
            keyboardVisible={keyboardVisible}
          />
        </View>
      ) : (
        <ScreenFrameInsets value><ScreenList
          data={session.terminals}
          keyExtractor={(terminal) => terminal.terminalId}
          header={
            <Stack>
              {failure}
              {session.listLoading ? <Loading label={copy("Terminaller yükleniyor…", "Loading terminals…")} /> : session.listWaiting ? (
                <Notice message={copy(
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
              detail={terminal.state}
              disabled={controlsDisabled || terminal.state !== "running"}
              onPress={() => attach(terminal)}
            />
          )}
        /></ScreenFrameInsets>
      )}
        </Animated.View>
      </KeyboardAvoidingView>
    </ScreenOverlay>
  );
}
