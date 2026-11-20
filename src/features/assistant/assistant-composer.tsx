import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import { useCopy } from "@/ui/copy";
import { HostWsError } from "@/remote/ws-connection";
import { RemoteHostError } from "@/remote/host-error";
import { useAssistantCall } from "./assistant-call-state";
import { Button, ErrorNotice, Notice, Row } from "@/ui/primitives";
import { ChatComposer } from "@/ui/chat-composer";
import { ChatCircleAction } from "@/ui/chat-controls";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { useLocalDraft } from "../workspace/use-local-draft";
import type { AssistantMobileClient } from "./assistant-client";
import { AssistantMicrophone, AssistantVoiceFeedback } from "./assistant-voice-controls";
import { consumeAssistantSpeech, useAssistantCompanion } from "./assistant-companion-state";
import { decodeAssistantDraft, encodeAssistantDraft, mergePendingSpeech } from "./assistant-speech-draft";
import {
  assistantSendKey,
  checkRoomMessage,
  readStoredSend,
  sendRoomMessage,
  type SendOutcome,
  type StoredSend,
} from "./assistant-send";

export const assistantDraftKey = (machineId: string, environmentId: string, threadId: string) =>
  `bycoda.mobile.draft.v1:${JSON.stringify(["assistant", machineId, environmentId, threadId])}`;

/**
 * Compact Room composer. The draft is stored per computer and conversation; the send identity is
 * recorded before dispatch, so an unconfirmed message is checked with its own receipt and never
 * sent again under a new ID.
 */
export function AssistantComposer({
  client,
  machineId,
  environmentId,
  threadId,
  current,
  voiceCurrent,
  enabled,
  sendable = true,
  onSettled,
}: {
  client: AssistantMobileClient;
  machineId: string;
  environmentId: string;
  threadId: string;
  current(): boolean;
  /** Project proof reads current stores and remains valid independently of the route subscription. */
  voiceCurrent(): boolean;
  enabled: boolean;
  /** New messages are accepted; recovery of an unconfirmed send stays available either way. */
  sendable?: boolean;
  onSettled(): Promise<unknown>;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const callActive = useAssistantCall(state => state.phase !== "idle");
  const draft = useLocalDraft(assistantDraftKey(machineId, environmentId, threadId), decodeAssistantDraft, encodeAssistantDraft);
  const storageKey = assistantSendKey(machineId, environmentId, threadId);
  const pending = useRef(false);
  const [recorded, setRecorded] = useState<StoredSend | null>(null);
  const [recordReady, setRecordReady] = useState(false);
  const [busy, setBusy] = useState<"send" | "check" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<"refused" | "unknown" | "restarted" | null>(null);
  useEffect(() => {
    let live = true;
    setRecordReady(false);
    readStoredSend(AsyncStorage, storageKey)
      .then((value) => live && setRecorded(value))
      .catch((cause) => live && setError(cause))
      .finally(() => live && setRecordReady(true));
    return () => {
      live = false;
    };
  }, [storageKey]);
  const text = draft.value?.text ?? "";
  const transcript = useAssistantCompanion(state => state.transcript);
  const importingSpeech = useRef(false);
  const matchingSpeech = transcript && transcript.target.machineId === machineId && transcript.target.environmentId === environmentId && transcript.target.threadId === threadId;
  const importSpeech = async () => {
    if (!transcript || !matchingSpeech || importingSpeech.current || !draft.ready || !enabled || !current()) return;
    importingSpeech.current = true;
    try {
      const next = mergePendingSpeech(draft.valueRef.current, transcript);
      draft.setValue(next);
      await draft.persist(next);
      await consumeAssistantSpeech(transcript);
      setError(null);
    } catch (cause) { setError(cause); }
    finally { importingSpeech.current = false; }
  };
  // A minimized recording returns only to its captured Room draft; recognition never sends.
  useEffect(() => {
    void importSpeech();
  }, [transcript, draft.ready, enabled, machineId, environmentId, threadId]);
  const settle = useCallback(
    async (sent: string) => {
      // Only the text that was delivered is cleared; anything typed meanwhile stays.
      if ((draft.valueRef.current?.text ?? "").trim() === sent) {
        draft.setValue(null);
        await draft.persist(null).catch(() => {});
      }
      setRecorded(null);
      await onSettled().catch(() => {});
    },
    [draft, onSettled],
  );
  const apply = async (outcome: SendOutcome, sent: string) => {
    if (!current()) return;
    if (outcome.kind === "settled") {
      setNotice(null);
      await settle(sent);
    } else if (outcome.kind === "refused") {
      setRecorded(null);
      setNotice("refused");
    } else {
      setNotice("unknown");
      setRecorded(await readStoredSend(AsyncStorage, storageKey).catch(() => null));
    }
  };
  const run = async (kind: "send" | "check", action: () => Promise<{ outcome: SendOutcome; sent: string }>) => {
    if (pending.current || !current() || !enabled || (kind === "send" && useAssistantCall.getState().phase !== "idle")) return;
    pending.current = true;
    setBusy(kind);
    setError(null);
    try {
      const { outcome, sent } = await action();
      await apply(outcome, sent);
    } catch (cause) {
      // The Host restarted since the send: its receipt can no longer be read, which is not a failure to show.
      if (current() && kind === "check" && (cause instanceof RemoteHostError || cause instanceof HostWsError) && cause.code === "CONTEXT_CHANGED") {
        setNotice("restarted");
      } else if (current()) {
        setError(cause);
        setRecorded(await readStoredSend(AsyncStorage, storageKey).catch(() => null));
      }
    } finally {
      pending.current = false;
      if (current()) setBusy(null);
    }
  };
  const send = () =>
    void run("send", async () => {
      const sent = text.trim();
      await draft.persist().catch(() => {});
      if (useAssistantCall.getState().phase !== "idle") throw new Error(copy("Önce sesli görüşmeyi bitir.", "End the voice call first."));
      const outcome = await sendRoomMessage({
        client,
        storage: AsyncStorage,
        storageKey,
        threadId,
        text: sent,
        createId: randomUUID,
      });
      return { outcome, sent };
    });
  const check = () =>
    void run("check", async () => {
      const sent = recorded?.text ?? "";
      return { outcome: await checkRoomMessage({ client, storage: AsyncStorage, storageKey }), sent };
    });
  const forget = async () => {
    await AsyncStorage.removeItem(storageKey).catch(() => {});
    setRecorded(null);
    setNotice(null);
  };
  const unconfirmed = recorded !== null;
  const canSend = !callActive && enabled && sendable && draft.ready && recordReady && !unconfirmed && !matchingSpeech && busy === null && !!text.trim();
  return (
    <View style={{ gap: space.xs, paddingHorizontal: space.screen }}>
      {unconfirmed ? (
        <Notice
          tone="warning"
          message={copy(
            "Mesajın ulaşıp ulaşmadığı doğrulanamadı. Aynı mesaj yeniden gönderilmeyecek; durumu kontrol et.",
            "It could not be confirmed that your message arrived. It will not be sent again; check its status.",
          )}
        >
          <Row>
            <Button
              label={copy("Durumu kontrol et", "Check status")}
              tone="primary"
              density="compact"
              busy={busy === "check"}
              disabled={!enabled || busy !== null}
              onPress={check}
            />
            <Button
              label={copy("Beklemeyi bırak", "Stop waiting")}
              density="compact"
              disabled={busy !== null}
              onPress={() => void forget()}
            />
          </Row>
        </Notice>
      ) : null}
      {notice === "refused" ? (
        <Notice
          tone="warning"
          message={copy(
            "Bilgisayar mesajı kabul etmedi. Taslağın duruyor; tekrar gönderebilirsin.",
            "The computer did not accept the message. Your draft is kept; you can send it again.",
          )}
        />
      ) : null}
      {notice === "unknown" && unconfirmed ? (
        <Notice
          tone="info"
          message={copy(
            "Bilgisayar henüz bir sonuç bildirmedi. Biraz sonra yeniden kontrol et.",
            "The computer has not reported a result yet. Check again in a moment.",
          )}
        />
      ) : null}
      {notice === "restarted" && unconfirmed ? (
        <Notice
          tone="info"
          message={copy(
            "Bilgisayar yeniden başladığı için bu mesajın sonucu artık doğrulanamıyor. Konuşmada görünüyorsa iletildi; görünmüyorsa beklemeyi bırakıp yeniden yaz.",
            "The computer restarted, so this message's result can no longer be confirmed. If it shows in the conversation it arrived; if not, stop waiting and write it again.",
          )}
        />
      ) : null}
      {error ? <ErrorNotice error={error} /> : null}
      {matchingSpeech && error ? <Button label={copy("Kaydet", "Save")} onPress={() => { void importSpeech(); }} /> : null}
      <AssistantVoiceFeedback />
      <ChatComposer
        value={text}
        onValueChange={(value) => draft.setValue({ text: value, speechIds: draft.valueRef.current?.speechIds ?? [] })}
        disabled={!draft.ready || unconfirmed || busy === "send"}
        field={{
          placeholder: copy("Asistana yaz", "Message the assistant"),
          accessibilityLabel: copy("Asistana mesaj", "Message to the assistant"),
          maxLength: 16000,
        }}
        leading={<AssistantMicrophone target={{ machineId, environmentId, threadId }} enabled={enabled && sendable && draft.ready && !unconfirmed && !busy} current={voiceCurrent} />}
        submit={
          <ChatCircleAction
            label={copy("Gönder", "Send")}
            active={canSend}
            disabled={!canSend}
            busy={busy === "send"}
            onPress={send}
          >
            <ArrowUp size={18} strokeWidth={2.6} color={canSend ? colors.primaryText : colors.muted} />
          </ChatCircleAction>
        }
      />
      {draft.error ? <ErrorNotice error={draft.error} onRetry={() => void draft.load()} /> : null}
    </View>
  );
}
