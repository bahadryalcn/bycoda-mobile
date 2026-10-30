import { View } from "react-native";
import {
  Body,
  Disclosure,
  Button,
  ErrorText,
  NavigationRow,
  Notice,
  Row,
  Sheet,
  Stack,
  ScreenList,
} from "@/ui/primitives";
import { TerminalViewport } from "@/ui/terminal-viewport";
import { useCopy } from "@/ui/copy";
import type { SessionScope } from "../workspace/session-types";
import { ptyRecoveryMessage } from "./mobile-pty-error";
import { useMobilePtySession } from "./use-mobile-pty-session";

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
    checkCreation,
    closeTerminal,
    clearFailedCreation,
    markLost,
    onPacket,
  } = session;
  const terminalError = session.error;
  const recovery = ptyRecoveryMessage(terminalError, copy);
  return (
    <Sheet
      visible
      size="full"
      scroll={false}
      title={copy("Etkileşimli terminal", "Interactive terminal")}
      onClose={() => {
        session.pause();
        onClose();
      }}
    >
      <View style={{ flex: 1 }}>
        <ScreenList
          data={session.terminals}
          keyExtractor={(terminal) => terminal.terminalId}
          header={
            <Stack>
              <Body muted>{session.machineName}</Body>
              <Notice
                tone="info"
                message={copy(
                  "Gerçek PTY bilgisayardaki açık ve odaklanmış yerel konuşma üzerinden çalışır. Arka planda giriş durur; eski giriş yeniden gönderilmez.",
                  "Real PTY requires the local conversation focused in the desktop. Input pauses in background; old input is never replayed.",
                )}
              />
              {session.unavailable ? (
                <Notice
                  tone="warning"
                  message={session.unavailable === "no-computer" ? copy(
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
              <Row>
                <Button
                  label={copy("Yeni etkileşimli terminal", "New interactive terminal")}
                  busy={busy && pendingAction === "primary"}
                  disabled={controlsDisabled || !!attempt}
                  onPress={create}
                />
                {lease ? (
                  <Button
                    label={copy("Sürdür", "Resume")}
                    busy={busy && pendingAction === "resume"}
                    disabled={controlsDisabled || !paused}
                    onPress={() => attach(lease.terminal, "resume")}
                  />
                ) : null}
                {lease ? (
                  <Button
                    label="Ctrl-C"
                    disabled={!canInterrupt || busy}
                    onPress={interrupt}
                  />
                ) : null}
              </Row>
              {attempt ? (
                <Button busy={busy && pendingAction === "secondary-1"}
                  label={copy("Oluşturma durumunu kontrol et", "Check creation status")}
                  disabled={controlsDisabled}
                  onPress={checkCreation}
                />
              ) : null}
              {lease ? (
                <Button busy={busy && pendingAction === "secondary-2"}
                  label={copy("Terminali kapat", "Close terminal")}
                  tone="danger"
                  disabled={controlsDisabled}
                  onPress={closeTerminal}
                />
              ) : null}
              {createFailed && attempt ? (
                <Button busy={busy && pendingAction === "secondary-3"}
                  label={copy(
                    "Başarısız oluşturma kaydını temizle",
                    "Clear failed creation receipt",
                  )}
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
        {showTerminal ? (
          <TerminalViewport ref={viewport} nonce={nonce} onPacket={onPacket} onLost={markLost} />
        ) : null}
      </View>
    </Sheet>
  );
}
