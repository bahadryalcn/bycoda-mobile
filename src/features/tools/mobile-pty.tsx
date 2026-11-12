import { useState } from "react";
import { Modal, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Plus from "lucide-react-native/icons/plus";
import Trash2 from "lucide-react-native/icons/trash-2";
import { useMobileTheme } from "@/ui/theme";
import {
  ActionMenu,
  Body,
  Disclosure,
  Button,
  ErrorText,
  HeaderBackButton,
  Heading,
  NavigationRow,
  Loading,
  Notice,
  Stack,
  StateView,
  ScreenList,
} from "@/ui/primitives";
import { TerminalViewport } from "@/ui/terminal-viewport";
import { useCopy } from "@/ui/copy";
import { metrics } from "@/ui/tokens";
import type { SessionScope } from "../workspace/session-types";
import { ptyRecoveryMessage } from "./mobile-pty-error";
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
  const insets = useSafeAreaInsets();
  const { colors } = useMobileTheme();
  const [readyNonce, setReadyNonce] = useState<string | null>(null);
  const session = useMobilePtySession({ scope, projectId });
  const {
    lease,
    attempt,
    createFailed,
    busy,
    pendingAction,
    controlsDisabled,
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
  const terminalError = session.error;
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
  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={leave}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right, paddingBottom: insets.bottom }}>
          <View style={{ flexDirection: "row", alignItems: "center", minHeight: metrics.touchTarget }}>
            <HeaderBackButton onPress={leave} />
            <View style={{ flex: 1 }}>
              <Heading numberOfLines={1}>{copy("Terminal", "Terminal")}</Heading>
              {session.machineName ? <Body muted numberOfLines={1}>{session.machineName}</Body> : null}
            </View>
            <ActionMenu
              label={copy("Terminal işlemleri", "Terminal actions")}
              busy={busy}
              actions={[
                { key: "new", label: copy("Yeni etkileşimli terminal", "New interactive terminal"), icon: <Plus size={18} color={colors.muted} />,
                  disabled: controlsDisabled || !!attempt, onPress: create },
                terminalOpen && { key: "interrupt", label: "Ctrl-C", disabled: !canInterrupt || busy, onPress: interrupt },
                terminalOpen && { key: "list", label: copy("Terminaller", "Terminals"), onPress: session.detach },
                terminalOpen && { key: "close", label: copy("Terminali kapat", "Close terminal"), destructive: true,
                  icon: <Trash2 size={18} color={colors.danger} />, disabled: controlsDisabled, onPress: closeTerminal },
              ]}
            />
          </View>
      {terminalOpen && lease ? (
        <View style={{ flex: 1 }}>
          {terminalError || gap || lost ? <Stack>{failure}</Stack> : null}
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
            disabled={controlsDisabled}
            onResume={() => attach(lease.terminal, "resume")}
            onAttachOutput={() => attachTerminalOutput(scope, session.recentOutput)}
            onKey={sendKey}
            // Re-sending the active configure makes the terminal focus, which opens the keyboard.
            onShowKeyboard={() => viewport.current?.post({ type: "configure", active: canInterrupt, freshPty: false })}
          />
        </View>
      ) : (
        <ScreenList
          data={session.terminals}
          keyExtractor={(terminal) => terminal.terminalId}
          header={
            <Stack>
              <Body muted>{session.machineName}</Body>
              {failure}
              <Button
                label={copy("Yeni etkileşimli terminal", "New interactive terminal")}
                busy={busy && pendingAction === "primary"}
                disabled={controlsDisabled || !!attempt}
                onPress={create}
              />
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
        />
      )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
