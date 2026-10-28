import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import {
  Body,
  Button,
  ErrorText,
  Notice,
  QueryState,
  ScreenList,
  Sheet,
  ToggleField,
} from "@/ui/primitives";
import { space } from "@/ui/tokens";
import type { SessionScope } from "./session-types";
import { historyPendingStore } from "./history-import-pending";
import {
  historySelection,
  readHistoryPreview,
  readHistoryStatus,
  type HistoryPreview,
  type HistoryStatus,
} from "./history-import-model";

export function HistoryImport({
  scope,
  projectId,
  onClose,
}: {
  scope: SessionScope;
  projectId: string;
  onClose: () => void;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [opening] = useState(() => ({
    ...scope,
    projectId,
    environmentId: machine?.environmentId,
    machineName: machine?.name,
  }));
  const current = () => {
    const state = useMachines.getState();
    return (
      state.activeId === opening.machineId &&
      state.machines.find((item) => item.id === opening.machineId)?.environmentId ===
        opening.environmentId &&
      machine?.id === opening.machineId &&
      scope.sessionId === opening.sessionId &&
      projectId === opening.projectId
    );
  };
  const supported =
    current() &&
    !!opening.environmentId &&
    machine?.capabilities?.includes("history.import.desktop.v1");
  const store = useMemo(
    () =>
      historyPendingStore(
        AsyncStorage,
        `bycoda.mobile.history-import.v1:${JSON.stringify([opening.machineId, opening.projectId, opening.sessionId])}`,
      ),
    [opening],
  );
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState<Awaited<ReturnType<typeof store.load>>>(null);
  const [review, setReview] = useState<HistoryPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialStatus, setInitialStatus] = useState<HistoryStatus>();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState("primary");
  const occupied = useRef(false);
  useEffect(() => {
    let live = true;
    void store
      .load()
      .then(
        (saved) => {
          if (live) setAttempt(saved);
        },
        (cause) => {
          if (live) setError(cause);
        },
      )
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [store]);
  const commit = useHostMutation("history.import.commit", ["sessions", opening.projectId]);
  const cancel = useHostMutation("history.import.cancel");
  const statusQuery = useHostQuery<HistoryStatus>(
    ["history-import-status", opening.sessionId, attempt?.operationId],
    "history.import.status",
    {
      projectId: opening.projectId,
      sessionId: opening.sessionId,
      operationId: attempt?.operationId,
    },
    {
      enabled: !!supported && !!attempt && attempt.environmentId === opening.environmentId,
      queryFn: async (client, signal) =>
        readHistoryStatus(
          await client.request(
            "history.import.status",
            {
              projectId: opening.projectId,
              sessionId: opening.sessionId,
              operationId: attempt?.operationId,
            },
            { signal },
          ),
        ),
      interval: (data) => (data?.state === "running" ? 2000 : false),
    },
  );
  const previewQuery = useHostQuery<HistoryPreview>(
    ["history-import-preview", opening.sessionId],
    "history.import.preview",
    { projectId: opening.projectId, sessionId: opening.sessionId },
    {
      enabled: false,
      queryFn: async (client, signal) =>
        readHistoryPreview(
          await client.request(
            "history.import.preview",
            { projectId: opening.projectId, sessionId: opening.sessionId },
            { signal },
          ),
          opening.environmentId!,
          opening.sessionId,
        ),
    },
  );
  const status = current() ? (statusQuery.data ?? initialStatus) : undefined;
  useEffect(() => {
    if (attempt && initialStatus && supported) void statusQuery.refetch();
  }, [attempt?.operationId, initialStatus, supported]);
  const disabled = !supported || loading || busy || !!attempt;
  const run = async (action: () => Promise<unknown>, actionKey = "primary") => {
    if (occupied.current || !supported) return;
    occupied.current = true;
    setPendingAction(actionKey);
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause);
    } finally {
      occupied.current = false;
      setBusy(false);
    }
  };
  const start = () => {
    if (disabled || !review) return;
    let selection: ReturnType<typeof historySelection>;
    try {
      selection = historySelection(review, selected);
    } catch (cause) {
      setError(cause);
      return;
    }
    confirmAction(
      copy("Geçmişi içe aktar", "Import history"),
      `${opening.machineName}\n${opening.projectId}\n${copy("Seçilen konuşmalar bilgisayardaki mevcut konuşma deposuna eklenir. Provider çalıştırılmaz.", "Selected conversations are added to the computer's existing conversation store. No provider is started.")}`,
      copy("İçe aktar", "Import"),
      () => {
        void run(async () => {
          if (!current()) return;
          const claimed = await store.claim({
            operationId: randomUUID(),
            environmentId: opening.environmentId!,
            digest: review.digest,
          });
          setAttempt(claimed.attempt);
          if (!claimed.claimed) return;
          if (!current()) {
            await store.clear(claimed.attempt.operationId);
            setAttempt(null);
            return;
          }
          const result = readHistoryStatus(
            await commit.mutateAsync({
              projectId: opening.projectId,
              sessionId: opening.sessionId,
              ...selection,
              operationId: claimed.attempt.operationId,
            }),
          );
          setInitialStatus(result);
        });
      },
      copy("Vazgeç", "Cancel"),
    );
  };
  return (
    <Sheet
      visible
      size="full"
      scroll={false}
      title={copy("Konuşma geçmişini içe aktar", "Import conversation history")}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <Button
          label={copy("Geçmişi içe aktar", "Import history")}
          disabled={disabled || !review || !selected.size}
          busy={busy && pendingAction === "primary"}
          onPress={start}
        />
      }
    >
      <ScreenList
        data={current() ? (review?.candidates ?? []) : []}
        keyExtractor={(item) => item.id}
        header={
          <View style={{ gap: space.sm }}>
            <Body>{`${opening.machineName ?? opening.machineId}\n${opening.projectId}`}</Body>
            <Notice
              message={copy(
                "Yalnız bu projedeki Claude ve Codex geçmişi incelenir. Tarama, aşağıdaki düğmeye dokununca başlar.",
                "Only Claude and Codex history for this project is reviewed. Scanning starts when you press the button below.",
              )}
            />
            {!supported ? (
              <Notice
                message={copy(
                  "Geçmişi içe aktarmak için güncel bycoda masaüstü uygulamasını bu projede açık tutun.",
                  "Keep the updated bycoda desktop app open in this project to import history.",
                )}
              />
            ) : null}
            <ErrorText error={error} />
            {attempt ? <QueryState query={statusQuery} /> : null}
            {attempt &&
            (attempt.environmentId !== opening.environmentId ||
              status?.state === "unknown" ||
              statusQuery.isError ||
              error) ? (
              <Notice
                tone="warning"
                message={copy(
                  "İçe aktarma sonucu bilinmiyor. İsteği tekrar göndermeden bilgisayardaki konuşmaları kontrol edin; durum sorgusu içe aktarmayı tekrar başlatmaz.",
                  "The import outcome is unknown. Check conversations on the computer before another request; checking status does not restart the import.",
                )}
              />
            ) : null}
            {status?.progress ? (
              <Body>
                {copy("Tamamlanan: {p0} / {p1}", "Completed: {p0} / {p1}", {
                  p0: status.progress.done,
                  p1: status.progress.total,
                })}
              </Body>
            ) : null}
            {status?.result ? (
              <Body>
                {copy(
                  "Eklenen: {p0}; atlanan: {p1}; başarısız: {p2}; salt okunur: {p3}; kısaltılan: {p4}.",
                  "Imported: {p0}; skipped: {p1}; failed: {p2}; read-only: {p3}; truncated: {p4}.",
                  {
                    p0: status.result.imported,
                    p1: status.result.skipped,
                    p2: status.result.failed,
                    p3: status.result.readOnly,
                    p4: status.result.truncated,
                  },
                )}
                {status.result.cancelled
                  ? ` ${copy("İptal edildi; eklenen konuşmalar korunur.", "Cancelled; conversations already imported are retained.")}`
                  : ""}
              </Body>
            ) : null}
            {status?.state === "failed" ? (
              <Notice
                tone="warning"
                message={copy(
                  "İçe aktarma tamamlanmadı. Yeni incelemeden önce bilgisayardaki konuşmaları kontrol edin.",
                  "Import did not finish. Check conversations on the computer before a new review.",
                )}
              />
            ) : null}
            {attempt ? (
              <>
                <Button busy={statusQuery.isFetching}
                  tone="quiet"
                  label={copy("İçe aktarma durumunu kontrol et", "Check import status")}
                  disabled={!supported || busy || statusQuery.isFetching}
                  onPress={() => {
                    void statusQuery.refetch();
                  }}
                />
                {status?.state === "running" ? (
                  <Button busy={busy && pendingAction === "secondary-1"}
                    tone="quiet"
                    label={copy("İçe aktarmayı durdur", "Stop importing")}
                    disabled={!supported || busy}
                    onPress={() => {
                      void run(async () => {
                        await cancel.mutateAsync({
                          projectId: opening.projectId,
                          sessionId: opening.sessionId,
                          operationId: attempt.operationId,
                        });
                        await statusQuery.refetch();
                      }, "secondary-1");
                    }}
                  />
                ) : null}
                {status?.state === "complete" || status?.state === "failed" ? (
                  <Button busy={busy && pendingAction === "secondary-2"}
                    tone="quiet"
                    label={copy("Yeni geçmiş incelemesi", "New history review")}
                    disabled={!supported || busy}
                    onPress={() => {
                      void run(async () => {
                        await store.clear(attempt.operationId);
                        setAttempt(null);
                        setReview(null);
                        setSelected(new Set());
                        setInitialStatus(undefined);
                      }, "secondary-2");
                    }}
                  />
                ) : null}
              </>
            ) : (
              <Button busy={busy && pendingAction === "secondary-3"}
                tone="quiet"
                label={copy("Bu projenin geçmişini tara", "Scan this project's history")}
                disabled={disabled || previewQuery.isFetching}
                onPress={() => {
                  void run(async () => {
                    const result = await previewQuery.refetch();
                    if (result.error) throw result.error;
                    if (result.data && current()) {
                      setReview(result.data);
                      setSelected(new Set());
                    }
                  }, "secondary-3");
                }}
              />
            )}
            {review && !review.candidates.length ? (
              <Notice
                message={copy(
                  "Bu proje için içe aktarılabilir geçmiş bulunamadı.",
                  "No importable history was found for this project.",
                )}
              />
            ) : null}
            {review?.omitted ? (
              <Body>
                {copy(
                  "İlk 500 aday gösteriliyor. Daha eski aday sayısı: {p0}.",
                  "Showing the first 500 candidates. Older candidates omitted: {p0}.",
                  { p0: review.omitted },
                )}
              </Body>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <ToggleField
            label={item.prompt || item.provider}
            detail={`${item.provider} · ${item.kind} · ${item.sizeBytes} B${item.imported ? ` · ${copy("Zaten içe aktarıldı", "Already imported")}` : !item.resumable ? ` · ${copy("Salt okunur", "Read-only")}` : ""}`}
            value={selected.has(item.id)}
            disabled={disabled || item.imported}
            onChange={(value) =>
              setSelected((before) => {
                const next = new Set(before);
                if (value) next.add(item.id);
                else next.delete(item.id);
                return next;
              })
            }
          />
        )}
      />
    </Sheet>
  );
}
