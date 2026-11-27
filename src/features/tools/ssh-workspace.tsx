import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from "expo-crypto";
import { useActiveMachine, useMachines } from "@/state/machines";
import {
  reviewedMachine,
  isReviewedMachine,
  reviewedMachineIdentityDigest,
} from "@/state/reviewed-machine";
import { useSecurity, isAppAccessAllowed } from "@/state/security";
import { useHostClient } from "@/state/queries";
import { useMounted } from "@/state/use-mounted";
import { useReviewedOperation } from "@/state/use-reviewed-operation";
import {
  reviewedOperationStore,
  type ReviewedOperationAttempt,
} from "@/state/reviewed-operation-store";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useInfoHint } from "@/ui/info-hint";
import { Body, Button, FormActions, ErrorText, Notice, Row, ScopeLine, SelectField, Sheet } from "@/ui/primitives";
import type { SessionScope } from "../workspace/session-types";
import {
  readSshCatalog,
  readSshWorkspaceReview,
  readSshWorkspaceStatus,
  type SshConnection,
  type SshWorkspaceReview,
  type SshWorkspaceStatus,
} from "./ssh-workspace-model";

type SshAttempts = {
  connect: ReviewedOperationAttempt | null;
  close: ReviewedOperationAttempt | null;
};
const noAttempts: SshAttempts = { connect: null, close: null };

export function SshWorkspace({
  scope,
  projectId,
  onClose,
}: {
  scope: SessionScope;
  projectId: string;
  onClose: () => void;
}) {
  const copy = useCopy(),
    machine = useActiveMachine(),
    client = useHostClient();
  const foregroundUnlocked = useSecurity(
    (value) => value.status === "unlocked" && value.appState === "active" && value.windowFocused,
  );
  const [opening] = useState(() => ({ ...scope, projectId, machine: reviewedMachine(machine) }));
  const mounted = useMounted();
  const current = () =>
    mounted.current &&
    isAppAccessAllowed() &&
    useSecurity.getState().status === "unlocked" &&
    useSecurity.getState().appState === "active" &&
    useSecurity.getState().windowFocused &&
    scope.machineId === opening.machineId &&
    scope.sessionId === opening.sessionId &&
    projectId === opening.projectId &&
    isReviewedMachine(opening.machine, useMachines.getState());
  const supported =
    foregroundUnlocked &&
    !!client &&
    current() &&
    !!opening.machine?.environmentId &&
    machine?.capabilities?.includes("ssh.workspace.desktop.v1");
  const params = { projectId: opening.projectId, sessionId: opening.sessionId };
  const stores = useMemo(() => {
    const key = `bycoda.ssh-workspace.v1:${JSON.stringify([opening.machineId, opening.machine?.environmentId, opening.projectId, opening.sessionId])}`;
    return {
      connect: reviewedOperationStore(AsyncStorage, `${key}:connect`),
      close: reviewedOperationStore(AsyncStorage, `${key}:close`),
    };
  }, [opening]);
  const {
    loaded,
    setLoaded,
    ready: storageReady,
    loading,
    error,
    setError,
    busy,
    pendingAction,
    run,
  } = useReviewedOperation({
    source: stores,
    enabled: !!opening.machine,
    canRun: () => !!supported && current(),
    load: async () => {
      const [connect, close, targetIdentityDigest] = await Promise.all([
        stores.connect.load(),
        stores.close.load(),
        identityDigest(),
      ]);
      if (
        [connect, close].some(
          (value) =>
            value &&
            (value.environmentId !== opening.machine?.environmentId ||
              value.targetIdentityDigest !== targetIdentityDigest),
        )
      )
        throw new Error("Saved SSH receipt machine identity mismatch");
      return { connect, close };
    },
  });
  const attempts = loaded ?? noAttempts;
  const setAttempts = (update: (value: SshAttempts) => SshAttempts) =>
    setLoaded((value) => update(value ?? noAttempts));
  const [connections, setConnections] = useState<SshConnection[]>([]),
    [selected, setSelected] = useState("");
  const [review, setReview] = useState<SshWorkspaceReview>(),
    [receipt, setReceipt] = useState<SshWorkspaceStatus>();
  const [reviewExpired, setReviewExpired] = useState(false);
  const expiredMessage = copy(
    "SSH incelemesinin süresi doldu. Devam etmek için yeniden incele.",
    "This SSH review expired. Review it again to continue.",
  );
  useEffect(() => {
    const remaining = review ? review.expiresAt - Date.now() : 0;
    setReviewExpired(!!review && remaining <= 0);
    if (!review || !foregroundUnlocked || remaining <= 0) return;
    const timer = setTimeout(() => setReviewExpired(true), Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [review, foregroundUnlocked]);
  const identityDigest = () =>
    reviewedMachineIdentityDigest(opening.machine, (value) =>
      digestStringAsync(CryptoDigestAlgorithm.SHA256, value),
    );
  const request = async (method: string, input: Record<string, unknown>) => {
    if (!current() || !client) throw new Error("Reviewed SSH source changed");
    const result = await client.request(method, { ...params, ...input }, { timeoutMs: 115000 });
    if (!current()) throw new Error("Reviewed SSH source changed");
    return result;
  };
  const activeKind = attempts.close ? "close" : "connect",
    active = attempts[activeKind];
  const disabled = busy || loading || !storageReady || !supported || !!error;
  // A loaded receipt or any in-progress review/draft keeps the full editor visible.
  const initialUnavailable = !supported && !loading && storageReady && !active && !selected &&
    !review && !receipt && !connections.length && !busy && !error;
  const unavailableMessage = !opening.machine ? copy(
    "Önce bir bilgisayara bağlanın, ardından SSH görünümünü yeniden açın.",
    "Connect a computer first, then reopen SSH.",
  ) : !isReviewedMachine(opening.machine, useMachines.getState()) || scope.machineId !== opening.machineId ||
      scope.sessionId !== opening.sessionId || projectId !== opening.projectId ? copy(
    "Bilgisayar veya oturum değişti. Doğru bilgisayarı ve oturumu seçip SSH görünümünü yeniden açın.",
    "The computer or session changed. Select the correct computer and session, then reopen SSH.",
  ) : !foregroundUnlocked || !isAppAccessAllowed() ? copy(
    "SSH işlemlerine devam etmek için uygulamanın kilidini açın ve bu ekranı açık tutun.",
    "Unlock the app and keep this screen active to continue with SSH.",
  ) : !client ? copy(
    "Bilgisayar bağlantısı kullanılamıyor. Bağlantıyı kontrol edip SSH görünümünü yeniden açın.",
    "The computer connection is unavailable. Check the connection and reopen SSH.",
  ) : !opening.machine.environmentId ? copy(
    "Bilgisayar kimliği alınamadı. Bağlantıyı yenileyip SSH görünümünü yeniden açın.",
    "The computer identity is unavailable. Refresh the connection and reopen SSH.",
  ) : copy(
    "Bu bilgisayar native SSH çalışma alanını desteklemiyor. Bilgisayardaki bycoda’yı güncelleyin.",
    "This computer does not support the native SSH workspace. Update bycoda on the computer.",
  );
  const info = useInfoHint(copy(
    "Oturum açma ve sunucu anahtarı onayı bilgisayarın Sunucular görünümündeki terminalde yapılır. Burada yalnızca bu isteğin oluşturduğu çalışma alanını takip edersiniz.",
    "Sign-in and host-key approval happen in the terminal in Servers on the computer. This screen tracks only the workspace this request created.",
  ), "visible");
  const stateLabel = (state: SshWorkspaceStatus["state"]) =>
    state === "opened-on-computer"
      ? copy("Bilgisayarda açıldı", "Opened on the computer")
      : state === "opening" || state === "pending"
        ? copy("Bilgisayarda onay bekleniyor", "Awaiting approval on the computer")
        : state === "closed"
          ? copy("Kapatıldı", "Closed")
          : state === "exited"
            ? copy("İşlem sona erdi", "Process exited")
            : state === "failed"
              ? copy("Tamamlanmadı", "Not completed")
              : copy("Sonuç bilinmiyor", "Result unknown");
  return (
    <Sheet
      visible
      title={copy("Bilgisayarda SSH", "SSH on the computer")}
      size={initialUnavailable || (!active && !review) ? "compact" : "form"}
      dismissible={!busy}
      onClose={onClose}
    >
      <Row>
        <ScopeLine scope={{ computer: machine?.name ?? opening.machineId }} />
        {initialUnavailable ? null : info.button}
      </Row>
      {initialUnavailable ? null : info.panel}
      {!supported ? <Notice tone="warning" message={unavailableMessage} /> : null}
      <ErrorText error={error} />
      {active ? (
        <>
          <Notice
            message={copy(
              "Kayıtlı istek tekrar gönderilmez. Sonuç bilinmiyorsa bilgisayardaki terminali inceleyin.",
              "The saved request is never resent. If the result is unknown, check the computer's terminal.",
            )}
          />
          {receipt ? <Body>{stateLabel(receipt.state)}</Body> : null}
          {receipt?.connectionId ? <Body mono>{receipt.connectionId}</Body> : null}
          <Button busy={busy && pendingAction === "secondary-1"}
            label={copy("Durumu denetle", "Check status")}
            disabled={busy || !supported}
            onPress={() => {
              void run(async () =>
                setReceipt(
                  readSshWorkspaceStatus(
                    await request("ssh.workspace.status", { requestId: active.operationId }),
                  ),
                ), "secondary-1"
              );
            }}
          />
          {receipt?.workspaceId &&
          ["opened-on-computer", "exited", "failed"].includes(receipt.state) &&
          !attempts.close ? (
            <Button busy={busy && pendingAction === "secondary-2"}
              label={copy("Kapatma etkisini incele", "Review close impact")}
              disabled={disabled}
              onPress={() => {
                void run(async () =>
                  setReview(
                    readSshWorkspaceReview(
                      await request("ssh.workspace.close.review", {
                        workspaceId: receipt.workspaceId,
                      }),
                      "close",
                      receipt.workspaceId!,
                    ),
                  ), "secondary-2"
                );
              }}
            />
          ) : null}
          {receipt && !["pending", "opening"].includes(receipt.state) ? (
            <Button busy={busy && pendingAction === "secondary-3"}
              tone="quiet"
              label={copy("Bu isteği unut", "Forget this request")}
              disabled={busy || !supported}
              onPress={() =>
                confirmAction(
                  copy("Bu isteği unut", "Forget this request"),
                  copy(
                    "Bu işlem SSH terminalini kapatmaz ve bilgisayardaki isteği iptal etmez. Bilinmeyen sonucu önce bilgisayarda inceleyin. Yeni bağlantı ayrı terminal açabilir.",
                    "This does not close the SSH terminal or cancel the computer's request. Inspect an unknown result on the computer first. A new connection may open a separate terminal.",
                  ),
                  copy("Bu isteği unut", "Forget this request"),
                  () => {
                    void run(async () => {
                      await stores[activeKind].clear(active.operationId);
                      setAttempts((value) => ({ ...value, [activeKind]: null }));
                      setReceipt(undefined);
                      setReview(undefined);
                    }, "secondary-3");
                  },
                  copy("Vazgeç", "Cancel"),
                )
              }
            />
          ) : null}
        </>
      ) : initialUnavailable ? null : (
        <>
          <Button busy={busy && pendingAction === "secondary-4"}
            label={copy("SSH sunucularını getir", "Get SSH servers")}
            disabled={disabled}
            onPress={() => {
              void run(async () => {
                const rows = readSshCatalog(await request("ssh.workspace.catalog.read", {}));
                setConnections(rows);
                setReview(undefined);
              }, "secondary-4");
            }}
          />
          <SelectField
            label={copy("SSH sunucusu", "SSH server")}
            value={selected}
            searchable
            disabled={disabled}
            options={connections.map((row) => ({
              value: row.id,
              label: row.name,
              detail: `${row.host}:${row.port}`,
            }))}
            onChange={(value) => {
              setSelected(value);
              setReview(undefined);
            }}
          />
          <Button busy={busy && pendingAction === "secondary-5"}
            label={copy("Bağlantıyı incele", "Review connection")}
            disabled={disabled || !selected}
            onPress={() => {
              void run(async () =>
                setReview(
                  readSshWorkspaceReview(
                    await request("ssh.workspace.review", { connectionId: selected }),
                    "connect",
                    selected,
                  ),
                ), "secondary-5"
              );
            }}
          />
        </>
      )}
      {review ? (
        <>
          <Body
            mono
          >{`${review.connection.name}\n${review.connection.host}:${review.connection.port}\n${review.configurationDigest}`}</Body>
          <Body muted>
            {review.operation === "close"
              ? copy("Yalnızca bu isteğin terminali kapanır.", "Only this request's terminal closes.")
              : copy("Bağlantı, bilgisayarda onaylanınca başlar.", "Starts once approved on the computer.")}
          </Body>
          {reviewExpired ? (
            <>
              <Notice tone="warning" message={expiredMessage} />
              <Button busy={busy && pendingAction === "secondary-6"}
                tone="quiet"
                label={copy("Yeniden incele", "Review again")}
                disabled={
                  busy || loading || !storageReady || !supported || !!attempts[review.operation]
                }
                onPress={() => {
                  void run(async () => {
                    const target =
                      review.operation === "connect" ? review.connection.id : review.workspaceId!;
                    const method =
                      review.operation === "connect"
                        ? "ssh.workspace.review"
                        : "ssh.workspace.close.review";
                    const input =
                      review.operation === "connect"
                        ? { connectionId: target }
                        : { workspaceId: target };
                    setReview(
                      readSshWorkspaceReview(
                        await request(method, input),
                        review.operation,
                        target,
                      ),
                    );
                  }, "secondary-6");
                }}
              />
            </>
          ) : null}
          <FormActions busy={busy && pendingAction === "secondary-7"}
            tone={review.operation === "close" ? "danger" : "primary"}
            submitLabel={copy("Bilgisayar onayı iste", "Request computer approval")}
            disabled={
              disabled ||
              reviewExpired ||
              review.expiresAt <= Date.now() ||
              !!attempts[review.operation]
            }
            onSubmit={() => {
              void run(async () => {
                if (review.expiresAt <= Date.now()) {
                  setReviewExpired(true);
                  throw new Error(expiredMessage);
                }
                const operation = review.operation,
                  value = {
                    operationId: randomUUID(),
                    environmentId: opening.machine!.environmentId!,
                    digest: await digestStringAsync(CryptoDigestAlgorithm.SHA256, review.reviewId),
                    targetIdentityDigest: await identityDigest(),
                  };
                if (!current()) throw new Error("Reviewed SSH source changed");
                if (review.expiresAt <= Date.now()) {
                  setReviewExpired(true);
                  throw new Error(expiredMessage);
                }
                const claim = await stores[operation].claim(value);
                setAttempts((previous) => ({ ...previous, [operation]: claim.attempt }));
                if (!claim.claimed || !current()) return;
                const result = readSshWorkspaceStatus(
                  await request(
                    operation === "close" ? "ssh.workspace.close.approve" : "ssh.workspace.approve",
                    { reviewId: review.reviewId, requestId: value.operationId },
                  ),
                );
                setReceipt(result);
                setReview(undefined);
              }, "secondary-7");
            }} onCancel={() => setReview(undefined)} cancelLabel={copy("Vazgeç", "Cancel")}
          />
        </>
      ) : null}
      {error && storageReady ? (
        <Button
          tone="quiet"
          label={copy("Hatayı gizle", "Dismiss error")}
          disabled={busy || !supported}
          onPress={() => setError(undefined)}
        />
      ) : null}
    </Sheet>
  );
}
