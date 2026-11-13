import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useReviewedOperation } from "@/state/use-reviewed-operation";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { formatAttachmentSize } from "./attachment-presentation";
import { useConnectionScope } from "@/state/connection-scope";
import { useSheetGuard } from "@/ui/sheet-guard";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { CollectionToolbar } from "@/ui/search-field";
import { RecordAccessUnavailable } from "./unavailable-state";
import { HistoryImportReview } from "./history-import-review";
import {
  ActionMenu,
  Body,
  Button,
  ErrorText,
  Notice,
  StateView,
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
  contextLabel,
  onClose,
}: {
  scope: SessionScope;
  projectId: string;
  contextLabel?: string;
  onClose: () => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const machine = useActiveMachine(),
    connection = useConnectionScope(),
    access = usePrivateContentAccess();
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [opening] = useState(() => ({
    ...scope,
    projectId,
    connection,
    contextLabel,
    environmentId: machine?.environmentId,
    machineName: machine?.name,
  }));
  const scopeCurrent =
    connection === opening.connection &&
    opening.connection.isCurrent() &&
    machine?.id === opening.machineId &&
    scope.machineId === opening.machineId &&
    scope.sessionId === opening.sessionId &&
    projectId === opening.projectId;
  const supported =
    scopeCurrent &&
    !!opening.environmentId &&
    !!machine?.capabilities?.includes("history.import.desktop.v1") &&
    access.allowed &&
    access.check();
  const live = useRef({ supported, access });
  live.current = { supported, access };
  const current = () =>
    mounted.current &&
    live.current.supported &&
    opening.connection.isCurrent() &&
    live.current.access.allowed &&
    live.current.access.check() &&
    useMachines.getState().activeId === opening.machineId;
  const store = useMemo(
    () =>
      historyPendingStore(
        AsyncStorage,
        `bycoda.mobile.history-import.v1:${JSON.stringify([opening.machineId, opening.projectId, opening.sessionId])}`,
      ),
    [opening],
  );
  const {
    loading,
    loaded: attempt,
    setLoaded: setAttempt,
    error,
    setError,
    busy,
    pendingAction,
    run,
    occupied,
  } = useReviewedOperation({
    source: store,
    load: () => store.load(),
    canRun: () => supported && current(),
  });
  const [review, setReview] = useState<HistoryPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { requestClose } = useSheetGuard({
    dirty: selected.size > 0 && !attempt,
    pending: busy,
    onClose,
  });
  const [initialStatus, setInitialStatus] = useState<HistoryStatus>();
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
  const privateFailure = [previewQuery.error, statusQuery.error].some(
    (error) => error && ["auth", "identity"].includes((error as { kind?: string }).kind ?? ""),
  );
  const readable =
    supported &&
    !privateFailure &&
    previewQuery.fetchStatus !== "paused" &&
    statusQuery.fetchStatus !== "paused";
  const readLease = useMemo(() => ({ active: false }), [readable]);
  useLayoutEffect(() => {
    readLease.active = true;
    return () => {
      readLease.active = false;
    };
  }, [readLease]);
  const canRead = () => readable && readLease.active && current();
  const status =
    readable && attempt?.environmentId === opening.environmentId && !!attempt
      ? (statusQuery.data ?? initialStatus)
      : undefined;
  useEffect(() => {
    if (attempt && initialStatus && supported && current()) void statusQuery.refetch();
  }, [attempt?.operationId, initialStatus, supported]);
  const disabled = !readable || loading || busy || !!attempt;
  const expired = !!review && review.expiresAt <= Date.now();
  const lease = useMemo(() => ({ active: false }), [review, selected, disabled]);
  useLayoutEffect(() => {
    lease.active = true;
    return () => {
      lease.active = false;
    };
  }, [lease]);
  type Approval = {
    preview: HistoryPreview;
    selection: ReturnType<typeof historySelection>;
    lease: typeof lease;
  };
  const [approval, setApproval] = useState<Approval | null>(null),
    issued = useRef<Approval | null>(null);
  const approvedCandidates = useMemo(() => {
    const ids = new Set(approval?.selection.candidateIds);
    return approval?.preview.candidates.filter((candidate) => ids.has(candidate.id)) ?? [];
  }, [approval]);
  useLayoutEffect(() => {
    if (issued.current && issued.current.lease !== lease) {
      issued.current = null;
      setApproval(null);
    }
  }, [lease]);
  useLayoutEffect(
    () => () => {
      issued.current = null;
    },
    [],
  );
  const [help, setHelp] = useState(false),
    [details, setDetails] = useState(false);
  const latest = useRef({ review, selected, attempt, disabled, status });
  latest.current = { review, selected, attempt, disabled, status };
  const targetLabel =
    opening.contextLabel ?? `${opening.machineName ?? opening.machineId} · ${opening.projectId}`;
  const start = () => {
    if (
      !canRead() ||
      disabled ||
      occupied.current ||
      issued.current ||
      !lease.active ||
      !review ||
      latest.current.review !== review ||
      latest.current.selected !== selected
    )
      return;
    try {
      const selection = historySelection(review, selected);
      const next = { preview: structuredClone(review), selection, lease };
      issued.current = next;
      setApproval(next);
    } catch (cause) {
      setError(cause);
    }
  };
  const confirm = () => {
    if (
      !approval ||
      issued.current !== approval ||
      approval.lease !== lease ||
      !lease.active ||
      disabled ||
      occupied.current ||
      !canRead()
    )
      return;
    issued.current = null;
    setApproval(null);
    void run(async () => {
      if (!canRead()) return;
      historySelection(approval.preview, new Set(approval.selection.candidateIds));
      const claimed = await store.claim({
        operationId: randomUUID(),
        environmentId: opening.environmentId!,
        digest: approval.preview.digest,
      });
      setAttempt(claimed.attempt);
      if (!claimed.claimed) return;
      if (!canRead()) {
        await store.clear(claimed.attempt.operationId);
        setAttempt(null);
        return;
      }
      try {
        historySelection(approval.preview, new Set(approval.selection.candidateIds));
      } catch (cause) {
        await store.clear(claimed.attempt.operationId);
        setAttempt(null);
        throw cause;
      }
      const result = readHistoryStatus(
        await commit.mutateAsync({
          projectId: opening.projectId,
          sessionId: opening.sessionId,
          ...approval.selection,
          operationId: claimed.attempt.operationId,
        }),
      );
      if (current()) setInitialStatus(result);
    });
  };
  const scan = () => {
    if (!canRead() || latest.current.disabled || occupied.current) return;
    void run(async () => {
      const result = await previewQuery.refetch();
      if (result.error) throw result.error;
      if (result.data && canRead()) {
        setReview(result.data);
        setSelected(new Set());
      }
    }, "secondary-3");
  };
  const sameEnvironment = !!attempt && attempt.environmentId === opening.environmentId;
  const checkStatus = () => {
    if (current() && sameEnvironment && !occupied.current && latest.current.attempt === attempt)
      void statusQuery.refetch();
  };
  const stop = () => {
    if (
      !attempt ||
      !canRead() ||
      occupied.current ||
      latest.current.attempt !== attempt ||
      latest.current.status?.state !== "running"
    )
      return;
    void run(async () => {
      if (!canRead() || latest.current.attempt !== attempt) return;
      await cancel.mutateAsync({
        projectId: opening.projectId,
        sessionId: opening.sessionId,
        operationId: attempt.operationId,
      });
      if (current()) await statusQuery.refetch();
    }, "secondary-1");
  };
  const newReview = () => {
    if (
      !attempt ||
      !canRead() ||
      occupied.current ||
      latest.current.attempt !== attempt ||
      !["complete", "failed"].includes(latest.current.status?.state ?? "")
    )
      return;
    void run(async () => {
      await store.clear(attempt.operationId);
      if (current()) {
        setAttempt(null);
        setReview(null);
        setSelected(new Set());
        setInitialStatus(undefined);
      }
    }, "secondary-2");
  };
  const footer = attempt ? (
    status?.state === "running" ? (
      <Button
        tone="quiet"
        label={copy("İçe aktarmayı durdur", "Stop importing")}
        disabled={!readable || busy}
        busy={busy && pendingAction === "secondary-1"}
        onPress={stop}
      />
    ) : status?.state === "complete" || status?.state === "failed" ? (
      <Button
        tone="primary"
        label={copy("Yeni geçmiş incelemesi", "New history review")}
        disabled={!readable || busy}
        busy={busy && pendingAction === "secondary-2"}
        onPress={newReview}
      />
    ) : (
      <Button
        tone="primary"
        label={copy("İçe aktarma durumunu kontrol et", "Check import status")}
        disabled={!supported || !sameEnvironment || busy || statusQuery.isFetching}
        busy={statusQuery.isFetching}
        onPress={checkStatus}
      />
    )
  ) : review && !expired ? (
    <Button
      tone="primary"
      label={copy("Geçmişi içe aktar", "Import history")}
      disabled={disabled || !selected.size}
      busy={busy && pendingAction === "primary"}
      onPress={start}
    />
  ) : (
    <Button
      tone="primary"
      label={copy("Bu projenin geçmişini tara", "Scan this project's history")}
      disabled={disabled || previewQuery.isFetching}
      busy={busy && pendingAction === "secondary-3"}
      onPress={scan}
    />
  );
  return (
    <>
      <Sheet
        visible
        size="full"
        scroll={false}
        title={copy("Konuşma geçmişini içe aktar", "Import conversation history")}
        onClose={() => {
          if (mounted.current && !occupied.current) requestClose();
        }}
        dismissible={!busy}
        footer={footer}
      >
        <ScreenList
          data={readable ? (review?.candidates ?? []) : []}
          keyExtractor={(item) => item.id}
          header={
            <View style={{ gap: space.sm }}>
              <CollectionToolbar
                field={readable ? <Body selectable>{targetLabel}</Body> : null}
                actions={
                  <ActionMenu
                    label={copy("Diğer işlemler", "More actions")}
                    actions={[
                      readable &&
                        !!review &&
                        !attempt && {
                          key: "select-all",
                          label: copy("Tümünü seç", "Select all"),
                          disabled,
                          onPress: () => {
                            if (
                              canRead() &&
                              !latest.current.disabled &&
                              !occupied.current &&
                              latest.current.review === review
                            )
                              setSelected(
                                new Set(
                                  review.candidates
                                    .filter((candidate) => !candidate.imported)
                                    .map((candidate) => candidate.id),
                                ),
                              );
                          },
                        },
                      readable &&
                        !!review &&
                        !attempt && {
                          key: "clear-selection",
                          label: copy("Seçimi temizle", "Clear selection"),
                          disabled: disabled || !selected.size,
                          onPress: () => {
                            if (
                              canRead() &&
                              !latest.current.disabled &&
                              !occupied.current &&
                              latest.current.review === review
                            )
                              setSelected(new Set());
                          },
                        },
                      !attempt &&
                        !!review && {
                          key: "scan",
                          label: copy("Bu projenin geçmişini tara", "Scan this project's history"),
                          disabled,
                          onPress: scan,
                        },
                      !!attempt && {
                        key: "status",
                        label: copy("İçe aktarma durumunu kontrol et", "Check import status"),
                        disabled: !supported || !sameEnvironment || busy || statusQuery.isFetching,
                        onPress: checkStatus,
                      },
                      {
                        key: "help",
                        label: copy("Yardım", "Help"),
                        onPress: () => {
                          if (mounted.current) setHelp(true);
                        },
                      },
                      readable && {
                        key: "details",
                        label: copy("Ayrıntılar", "Details"),
                        onPress: () => {
                          if (canRead()) setDetails(true);
                        },
                      },
                    ]}
                  />
                }
              />
              {privateFailure ? (
                <QueryState
                  query={{ ...(previewQuery.error ? previewQuery : statusQuery), data: undefined }}
                />
              ) : !readable ? (
                <RecordAccessUnavailable />
              ) : null}
              {readable ? <ErrorText error={error} /> : null}
              {attempt && !privateFailure ? <QueryState query={statusQuery} /> : null}
              {readable && expired && !attempt ? (
                <Notice
                  tone="warning"
                  message={copy(
                    "Geçmiş incelemesinin süresi doldu. İçe aktarmadan önce yeniden tarayın.",
                    "History review expired. Scan again before importing.",
                  )}
                />
              ) : null}
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
              {readable && review && !review.candidates.length ? (
                <StateView
                  compact
                  illustration="inbox-empty"
                  title={copy(
                    "Bu proje için içe aktarılabilir geçmiş bulunamadı.",
                    "No importable history was found for this project.",
                  )}
                />
              ) : null}
              {readable && review?.omitted ? (
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
              labelLines={2}
              detail={`${item.provider} · ${item.kind} · ${formatAttachmentSize(item.sizeBytes, locale)}${item.imported ? ` · ${copy("Zaten içe aktarıldı", "Already imported")}` : !item.resumable ? ` · ${copy("Salt okunur", "Read-only")}` : ""}`}
              value={selected.has(item.id)}
              disabled={disabled || item.imported}
              onChange={(value) => {
                if (
                  !canRead() ||
                  latest.current.disabled ||
                  disabled ||
                  occupied.current ||
                  latest.current.review !== review
                )
                  return;
                setSelected((before) => {
                  const next = new Set(before);
                  if (value) next.add(item.id);
                  else next.delete(item.id);
                  return next;
                });
              }}
            />
          )}
        />
      </Sheet>
      <Sheet
        visible={help}
        size="compact"
        title={copy("Yardım", "Help")}
        onClose={() => setHelp(false)}
      >
        <Body>
          {copy(
            "Yalnız bu projedeki Claude ve Codex geçmişi incelenir. Tarama, aşağıdaki düğmeye dokununca başlar.",
            "Only Claude and Codex history for this project is reviewed. Scanning starts when you press the button below.",
          )}
        </Body>
      </Sheet>
      <PrivateContentAccessProvider value={{ allowed: readable, check: canRead }}>
        <Sheet
          visible={details && readable}
          size="compact"
          title={copy("Ayrıntılar", "Details")}
          onClose={() => setDetails(false)}
        >
          {readable ? (
            <>
              <Body selectable>{targetLabel}</Body>
              <Body mono selectable>
                {opening.projectId}
              </Body>
              <Body mono selectable>
                {opening.sessionId}
              </Body>
            </>
          ) : null}
        </Sheet>
        {approval && approval.lease === lease && !disabled ? (
          <HistoryImportReview
            targetLabel={targetLabel}
            projectId={opening.projectId}
            sessionId={opening.sessionId}
            candidates={approvedCandidates}
            onClose={() => {
              if (issued.current === approval) {
                issued.current = null;
                setApproval(null);
              }
            }}
            onConfirm={confirm}
          />
        ) : null}
      </PrivateContentAccessProvider>
    </>
  );
}
