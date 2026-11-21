import { router } from "expo-router";
import { onlineManager } from "@tanstack/react-query";
import { useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ErrorNotice, Loading, Notice, Skeleton } from "./feedback";
import { StateView } from "./state-view";
import { errorIllustration, errorTitle } from "./state-model";
import { showToast, useToastAvailable } from "./toast";
import { useCopy } from "./copy";
import { errorMessage, isConnectionLevelError, remoteErrorKind } from "./error-message";
import { getQueryPresentation } from "./query-presentation";
import type { QueryStateProps, MutationStateProps } from "./component-props";
import { SheetGuardContext } from "./sheet-guard-context";
import { useConnectionFeedbackOwner } from "./connection-feedback-scope";
import { FormActionBusy } from "./form-action-context";
import { isTransientConnectionError, reconnectRefetchDelay } from "../state/query-retry";
import { useActiveHostLinkDown } from "../state/host-runtime-state";

/** After this many quiet automatic refetches a dropped link is shown as a real, retryable error. */
const RECONNECT_ATTEMPTS = 4;

/** A dropped link (Host restart, network switch) refetches itself instead of asking for Retry. */
function useQuietReconnect(query: QueryStateProps["query"], online: boolean) {
  const transient = online && isTransientConnectionError(query.error);
  const [attempt, setAttempt] = useState(0);
  const refetch = useRef(query.refetch);
  refetch.current = query.refetch;
  useEffect(() => {
    if (!transient) {
      setAttempt(0);
      return;
    }
    if (attempt >= RECONNECT_ATTEMPTS || !refetch.current) return;
    const timer = setTimeout(() => {
      void Promise.resolve(refetch.current?.()).catch(() => undefined);
      setAttempt((count) => count + 1);
    }, reconnectRefetchDelay(attempt));
    return () => clearTimeout(timer);
  }, [transient, attempt]);
  return transient && attempt < RECONNECT_ATTEMPTS && !!query.refetch;
}

export function QueryState(props: QueryStateProps) {
  const { loading = "list", loadingLabel } = props;
  const state = useQueryStatePresentation(props);
  if (loading !== "list" && loading !== "content") return <>{state.node}</>;
  return (
    <>
      {state.lead}
      <Skeleton variant={loading} label={state.label ?? loadingLabel} loading={state.skeleton} />
      {state.node}
    </>
  );
}

function useQueryStatePresentation({
  query,
  compact = false,
  empty,
  emptyTitle,
  emptyDetail,
  emptyAction,
  emptyIllustration,
  searching,
  offline,
  onManageConnections,
  loading = "list",
  loadingLabel,
  renderLoading,
}: QueryStateProps): { node: ReactNode; skeleton: boolean; label?: string; lead?: ReactNode } {
  const copy = useCopy();
  const sheet = useContext(SheetGuardContext);
  const presentation = getQueryPresentation(query, !!empty);
  // The app lifecycle feeds NetInfo into React Query's online manager.
  const deviceOffline = !useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () => onlineManager.isOnline(), () => onlineManager.isOnline());
  const reconnecting = useQuietReconnect(query, !deviceOffline);
  // The computer is known to be unreachable: a read with nothing loaded would otherwise spin
  // through every request deadline and retry before it could say anything.
  const linkDown = useActiveHostLinkDown();
  const kind = remoteErrorKind(query.error);
  const waitingForLink = linkDown && !deviceOffline && query.data === undefined &&
    (presentation === "loading" || (presentation === "error" && isTransientConnectionError(query.error)));
  const repair = kind === "auth" || kind === "identity";
  const showOffline = deviceOffline && !repair && query.data === undefined &&
    (presentation === "loading" || presentation === "paused" ||
      (presentation === "error" && (kind === "network" || isTransientConnectionError(query.error))));
  // Revoked access, an unreachable or outdated computer and a missing network are one problem
  // for the whole region; only one section of a sheet or screen says so.
  const connectionLevel = waitingForLink || query.data === undefined && presentation !== "empty" && !reconnecting && (
    showOffline || presentation === "paused" ||
    (presentation === "error" && isConnectionLevelError(query.error)));
  const showsConnection = useConnectionFeedbackOwner(connectionLevel);
  if (connectionLevel && !showsConnection) return { node: null, skeleton: false };
  const repairAction = repair ? {
    label: copy("Bağlantıları yönet", "Manage connections"),
    onPress: onManageConnections ?? (() => {
      const navigate = () => router.navigate("/machines");
      if (sheet) (sheet.requestCloseStackThen ?? sheet.requestCloseThen)(navigate);
      else navigate();
    }),
  } : undefined;
  const placeholder = loading === "list" || loading === "content";
  const renderProgress = (label?: string) =>
    loading === "inline" || loading === "centered"
      ? renderLoading
        ? renderLoading(label ?? copy("Yükleniyor…", "Loading…"))
        : <Loading label={label} centered={loading === "centered"} />
      : null;
  if (presentation === "loading" && !showOffline && !waitingForLink) {
    // A failed attempt that is being retried can take several request deadlines on a busy
    // computer; without a word the placeholder looks frozen.
    const slow = (query.failureCount ?? 0) > 0
      ? copy("Bilgisayar yavaş yanıt veriyor; yeniden deneniyor…", "The computer is slow to answer; trying again…")
      : undefined;
    return {
      skeleton: placeholder,
      label: slow,
      lead: slow && placeholder ? <Notice message={slow} /> : undefined,
      node: renderProgress(slow ?? loadingLabel),
    };
  }
  // Shown data stays as it is while a refresh fails or waits: the computer pill carries the
  // connection state, so no warning banner competes with the content.
  if (query.data !== undefined && (presentation === "paused" || presentation === "stale-error")) {
    // A link problem is the pill's to report. Any other failed refresh (a rejected or incompatible
    // reply while the computer is connected) would leave old statuses on screen with no sign at all.
    if (presentation === "paused" || reconnecting || deviceOffline || isConnectionLevelError(query.error) || isTransientConnectionError(query.error))
      return { node: null, skeleton: false };
    return { skeleton: false, node: (
      <Notice tone="warning"
        message={copy("Son yüklenen hâli gösteriliyor; yenilenemedi.", "Showing the last loaded version; it could not be refreshed.")}
        action={query.refetch ? { label: copy("Yenile", "Refresh"), onPress: () => { if (!query.isFetching) void query.refetch?.(); } } : undefined} />
    ) };
  }
  // Without a network nothing can load or reconnect: say so once, centered, instead of spinning.
  if (showOffline)
    return { skeleton: false, node: loading === "none" ? null : (
      <StateView
        compact={compact}
        illustration="offline"
        title={copy("Çevrimdışısın", "You're offline")}
        description={copy(
          "Wi-Fi’ye veya mobil veriye bağlan. Bağlantı gelince içerik kendiliğinden yüklenecek.",
          "Connect to Wi-Fi or mobile data. This loads by itself when you're back online.",
        )}
      />
    ) };
  // A quiet reconnect is still a load: keep the same placeholder (the pill shows the link state).
  if (reconnecting && presentation === "error" && !waitingForLink) {
    const label = copy("Yeniden bağlanılıyor…", "Reconnecting…");
    return {
      skeleton: placeholder,
      label,
      // The placeholder alone would look like a first load that never ends.
      lead: placeholder ? <Notice message={label} /> : undefined,
      node: renderProgress(label),
    };
  }
  if (presentation === "paused" || waitingForLink)
    return { skeleton: false, node: (
      <StateView
        compact={compact}
        illustration="unreachable"
        title={copy("Bağlantı bekleniyor", "Waiting for a connection")}
        description={compact ? undefined : copy(
          "Bilgisayarına yeniden ulaşıldığında içerik kendiliğinden yüklenecek.",
          "This loads by itself when your computer is reachable again.",
        )}
        action={{
          label: copy("Bağlantıları yönet", "Manage connections"),
          onPress: onManageConnections ?? (() => {
            const navigate = () => router.navigate("/machines");
            if (sheet) (sheet.requestCloseStackThen ?? sheet.requestCloseThen)(navigate);
            else navigate();
          }),
        }}
      />
    ) };
  if (presentation === "error") {
    const retry =
      !repair && kind !== "unsupported" && query.refetch
        ? { label: copy("Yeniden dene", "Retry"), onPress: () => { if (!query.isFetching) void query.refetch?.(); }, busy: query.isFetching }
        : undefined;
    return { skeleton: false, node: (
      <StateView
        compact={compact}
        tone="danger"
        illustration={errorIllustration(kind, offline)}
        title={errorTitle(kind, copy, offline)}
        description={errorMessage(query.error, copy, undefined, { read: true })}
        action={repairAction ?? retry}
      />
    ) };
  }
  return { skeleton: false, node: presentation === "empty" ? (
    <StateView
      compact={compact}
      illustration={emptyIllustration ?? (searching ? "search-empty" : undefined)}
      title={
        emptyTitle ??
        (typeof empty === "string" ? empty : copy("Henüz bir kayıt yok", "Nothing here yet"))
      }
      description={emptyDetail}
      action={emptyAction}
    />
  ) : null };
}

export function MutationState({ mutation, pending, success }: MutationStateProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  // A busy action control already shows this progress; a second indicator only adds noise.
  const actionBusy = useContext(FormActionBusy);
  // Translating the acknowledgement must not restart its completed operation.
  const hasSuccess = !!success;
  // With a mounted toast host the acknowledgement is a toast; otherwise it stays inline.
  const toasts = useToastAvailable();
  const successText = useRef(success);
  successText.current = success;
  const toasted = useRef<number | null>(null);
  useEffect(() => {
    if (!mutation.isSuccess || !hasSuccess) {
      setShowSuccess(false);
      toasted.current = null;
      return;
    }
    if (toasts) {
      setShowSuccess(false);
      const key = mutation.submittedAt ?? 0;
      if (toasted.current !== key && successText.current) {
        toasted.current = key;
        showToast({ tone: "success", message: successText.current });
      }
      return;
    }
    setShowSuccess(true);
    const timer = setTimeout(() => setShowSuccess(false), 5000);
    return () => clearTimeout(timer);
  }, [mutation.isSuccess, mutation.submittedAt, hasSuccess, toasts]);
  if (mutation.isPending) return pending && !actionBusy ? <Loading label={pending} /> : null;
  if (mutation.isError || mutation.error) return <ErrorNotice error={mutation.error} />;
  return mutation.isSuccess && success && showSuccess ? (
    <Notice tone="success" message={success} />
  ) : null;
}
