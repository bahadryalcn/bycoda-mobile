import { router } from "expo-router";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ErrorNotice, Loading, Notice, Skeleton, StatusLine } from "./feedback";
import { StateView } from "./state-view";
import { NoResults } from "./no-results";
import { errorTitle, queryStateSize } from "./state-model";
import { showToast, useToastAvailable } from "./toast";
import { useCopy } from "./copy";
import { errorMessage, isConnectionLevelError, remoteErrorKind } from "./error-message";
import { getQueryPresentation } from "./query-presentation";
import type { QueryStateProps, MutationStateProps } from "./component-props";
import { SheetGuardContext } from "./sheet-guard-context";
import { useConnectionFeedbackOwner } from "./connection-feedback-scope";
import { FormActionBusy } from "./form-action-context";
import { usePersistentCondition } from "./use-persistent-error";
import { isTransientConnectionError, READ_RETRY_GRACE_MS, reconnectRefetchDelay } from "../state/query-retry";
import { useActiveHostLinkDown, useActiveHostRecoveryMachine, useHostForegroundGeneration, useHostRuntimeState } from "../state/host-runtime-state";
import { useDeviceOffline } from "../state/device-network";
import { RemoteHostError } from "../remote/host-error";

/** After this many quiet automatic refetches a dropped link is shown as a real, retryable error. */
const RECONNECT_ATTEMPTS = 4;

/** Delay recovery feedback without changing the caller's read or write gates. */
export function useReadRetryNotice(recovering: boolean, machineId: string | null) {
  // A return to the foreground starts the grace over: the socket reconnects before anything loads.
  const generation = useHostForegroundGeneration();
  const [elapsed, setElapsed] = useState<{ machineId: string | null; generation: number } | null>(null);
  // Keep the initial loading surface while automatic recovery has a chance to finish.
  useEffect(() => {
    setElapsed(null);
    if (!recovering) return;
    const timer = setTimeout(() => setElapsed({ machineId, generation }), READ_RETRY_GRACE_MS);
    return () => clearTimeout(timer);
  }, [recovering, machineId, generation]);
  return recovering && elapsed?.machineId === machineId && elapsed.generation === generation;
}

/** A dropped link (Host restart, network switch) refetches itself instead of asking for Retry. */
function useQuietReconnect(query: QueryStateProps["query"], transient: boolean, fetching: boolean) {
  const [attempt, setAttempt] = useState(0);
  const refetch = useRef(query.refetch);
  refetch.current = query.refetch;
  // A resumed app reconnects its socket first; it gets the whole quiet budget again.
  const generation = useHostForegroundGeneration();
  useEffect(() => setAttempt(0), [generation]);
  // An initial refetch can clear the previous error while it is pending. Keep the retry budget.
  useEffect(() => {
    if (!transient) {
      if (!fetching) setAttempt(0);
      return;
    }
    if (fetching || attempt >= RECONNECT_ATTEMPTS || !refetch.current) return;
    const timer = setTimeout(() => {
      setAttempt((count) => count + 1);
      void Promise.resolve(refetch.current?.()).catch(() => undefined);
    }, reconnectRefetchDelay(attempt));
    return () => clearTimeout(timer);
  }, [transient, fetching, attempt]);
  return {
    reconnecting: transient && attempt < RECONNECT_ATTEMPTS && !!query.refetch,
    refetching: fetching && attempt > 0,
  };
}

/** Unknown Host replies and timeouts on a reachable computer get one quiet automatic retry after this delay. */
const GRACE_RETRY_DELAY_MS = 1_000;
/** Shown data that keeps failing to refresh is marked stale after this many consecutive failures... */
const STALE_FAILURE_COUNT = 2;
/** ...once they span at least this long, so two quick poll failures that then heal stay silent... */
const STALE_FAILURE_MIN_MS = 15_000;
/** ...or after it has been stale this long. */
const STALE_NOTICE_AFTER_MS = 60_000;

/**
 * A failure that is not a dropped link (a timeout on a reachable computer, an unknown Host reply)
 * first stays quiet for the shared grace with one automatic retry. `hidden` keeps the loading
 * presentation; `slow` says the automatic retry outlasted the grace.
 */
export function useFailureGrace(failing: boolean, fetching: boolean, refetch?: () => unknown) {
  const [phase, setPhase] = useState<"idle" | "grace" | "shown">("idle");
  const [retrying, setRetrying] = useState(false);
  const latest = useRef(refetch);
  latest.current = refetch;
  // A failure shown before the app left is quiet again while the resumed socket reconnects.
  const generation = useHostForegroundGeneration();
  useEffect(() => setPhase((current) => current === "shown" ? "grace" : current), [generation]);
  useEffect(() => {
    if (failing && phase === "idle") setPhase("grace");
    // The episode ends once nothing fails and nothing for it runs (data arrived or the query changed).
    else if (!failing && !fetching && phase !== "idle") {
      setPhase("idle");
      setRetrying(false);
    }
  }, [failing, fetching, phase]);
  useEffect(() => {
    if (phase !== "grace") return;
    const retry = setTimeout(() => {
      if (!latest.current) return;
      setRetrying(true);
      void Promise.resolve(latest.current()).catch(() => undefined).finally(() => setRetrying(false));
    }, GRACE_RETRY_DELAY_MS);
    const shown = setTimeout(() => setPhase("shown"), READ_RETRY_GRACE_MS);
    return () => { clearTimeout(retry); clearTimeout(shown); };
  }, [phase, generation]);
  return { hidden: failing && (phase !== "shown" || retrying), slow: failing && phase === "shown" && retrying };
}

/** A failed background refresh under shown data stays silent until it repeats for 15 s or lasts a minute. */
export function useStaleFailureVisible(stale: boolean, error: unknown) {
  const [failures, setFailures] = useState<{ last: unknown; count: number }>({ last: undefined, count: 0 });
  const [aged, setAged] = useState(false);
  // Time away and refreshes that failed while the socket was closed do not mark shown data stale:
  // a return to the foreground counts failures and age from zero again.
  const generation = useHostForegroundGeneration();
  const counted = useRef(generation);
  useEffect(() => {
    if (!stale) {
      counted.current = generation;
      setFailures((current) => current.count ? { last: undefined, count: 0 } : current);
      setAged(false);
      return;
    }
    if (counted.current !== generation) {
      counted.current = generation;
      setFailures({ last: error, count: 0 });
      setAged(false);
      return;
    }
    setFailures((current) => current.last === error ? current : { last: error, count: current.count + 1 });
  }, [stale, error, generation]);
  useEffect(() => {
    if (!stale) return;
    const timer = setTimeout(() => setAged(true), STALE_NOTICE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [stale, generation]);
  const lasted = usePersistentCondition(stale, STALE_FAILURE_MIN_MS);
  return stale && ((failures.count >= STALE_FAILURE_COUNT && lasted) || aged);
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
  size,
  empty,
  emptyTitle,
  emptyDetail,
  emptyAction,
  emptyIllustration,
  searching,
  noResults,
  offline,
  onManageConnections,
  shareConnectionFeedback,
  loading = "list",
  loadingLabel,
  renderLoading,
}: QueryStateProps): { node: ReactNode; skeleton: boolean; label?: string; lead?: ReactNode } {
  const copy = useCopy();
  const sheet = useContext(SheetGuardContext);
  const toasts = useToastAvailable();
  const presentation = getQueryPresentation(query, !!empty);
  const deviceOffline = useDeviceOffline();
  // The computer is known to be unreachable: a read with nothing loaded would otherwise spin
  // through every request deadline and retry before it could say anything.
  const linkDown = useActiveHostLinkDown();
  const recoveringMachine = useActiveHostRecoveryMachine();
  const kind = remoteErrorKind(query.error);
  const transientLinkFailure = (linkDown || kind !== "host") && isTransientConnectionError(query.error);
  const failedHostRuntime = useHostRuntimeState(query.error instanceof RemoteHostError ? query.error.machineId : null);
  // A read can time out even while the socket is online. Let the user retry after the query's own attempts.
  const readTimedOut = kind === "timeout" && failedHostRuntime === "ready" && !linkDown;
  const fetching = query.isFetching === true || query.fetchStatus === "fetching";
  const { reconnecting, refetching } = useQuietReconnect(
    query,
    !deviceOffline && transientLinkFailure && !readTimedOut,
    fetching || presentation === "loading",
  );
  // A timeout on a reachable computer or an unknown Host reply joins the same quiet grace as a
  // dropped link (one automatic retry) before anything is shown.
  const graced = useFailureGrace(
    presentation === "error" && query.data === undefined && !deviceOffline &&
      (readTimedOut || ((kind === "host" || kind === "protocol") && !transientLinkFailure)),
    fetching,
    query.refetch,
  );
  const needsLink = !deviceOffline && query.data === undefined &&
    (presentation === "loading" || presentation === "paused" ||
      (presentation === "error" && transientLinkFailure));
  const retryingLoad = presentation === "loading" && (query.failureCount ?? 0) > 0;
  const explainRetry = useReadRetryNotice(
    !deviceOffline &&
      ((!!recoveringMachine && needsLink) || (presentation === "error" && reconnecting) || retryingLoad ||
        (presentation === "loading" && refetching)),
    recoveringMachine,
  );
  const waitingForLink = linkDown && needsLink && (!recoveringMachine || explainRetry);
  const quietLinkRecovery = !!recoveringMachine && needsLink && !explainRetry;
  const repair = kind === "auth" || kind === "identity";
  const showOffline = deviceOffline && !repair && query.data === undefined &&
    (presentation === "loading" || presentation === "paused" ||
      (presentation === "error" && (kind === "network" || isTransientConnectionError(query.error))));
  // Shown data stays as it is while a refresh fails or waits: the computer pill carries link
  // failures, and a connected Host refusing a refresh stays silent until it repeats.
  const staleFailure = query.data !== undefined && presentation === "stale-error" && !linkDown && !deviceOffline &&
    !isConnectionLevelError(query.error) && !(transientLinkFailure && !readTimedOut);
  const staleVisible = useStaleFailureVisible(staleFailure, query.error);
  // Revoked access, an unreachable or outdated computer and a missing network are one problem
  // for the whole region; only one section of a sheet or screen says so.
  const connectionLevel = waitingForLink || query.data === undefined && presentation !== "empty" && !reconnecting && (
    showOffline || presentation === "paused" ||
    (presentation === "error" && isConnectionLevelError(query.error)));
  const sharedOutage = !!shareConnectionFeedback && query.data === undefined && (
    waitingForLink || showOffline || presentation === "paused" ||
    (presentation === "error" && !reconnecting && !readTimedOut && (kind === "network" || kind === "timeout") &&
      isTransientConnectionError(query.error)));
  // Any other failed first load is reported once per region too; later sections get one line.
  const loadFailure = query.data === undefined && presentation === "error" && !reconnecting && !graced.hidden;
  const canShowConnection = !quietLinkRecovery && !(showOffline && loading === "none");
  const connection = useConnectionFeedbackOwner(canShowConnection && (connectionLevel || sharedOutage || loadFailure),
    sharedOutage, () => query.isFetching ? undefined : query.refetch?.());
  if (!connection.visible) {
    if (connectionLevel || sharedOutage) return { node: null, skeleton: false };
    return { skeleton: false, node: (
      <StateView size="line" tone="danger" title={copy("Bu bölüm yüklenemedi.", "This section couldn't load.")} />
    ) };
  }
  const stateSize = (art = false) => queryStateSize({ size, compact, loading, owner: true, art });
  const manageConnections = onManageConnections ?? (() => {
    const navigate = () => router.navigate("/machines");
    if (sheet) (sheet.requestCloseStackThen ?? sheet.requestCloseThen)(navigate);
    else navigate();
  });
  const repairAction = repair ? { label: copy("Bağlantıları yönet", "Manage connections"), onPress: manageConnections } : undefined;
  const placeholder = loading === "list" || loading === "content";
  // The computer pill already reports a dropped or recovering link; the region adds no second line.
  const pillReports = linkDown || !!recoveringMachine;
  const renderProgress = (label?: string) =>
    loading === "inline" || loading === "centered"
      ? renderLoading
        ? renderLoading(label ?? copy("Yükleniyor…", "Loading…"))
        : <Loading label={label} centered={loading === "centered"} delayed />
      : null;
  if ((presentation === "loading" || quietLinkRecovery || graced.hidden) && !showOffline && !waitingForLink) {
    // A failed attempt that is being retried can take several request deadlines on a busy
    // computer; without a word the placeholder looks frozen.
    const slow = explainRetry || graced.slow
      ? copy("Bilgisayar yavaş yanıt veriyor; yeniden deneniyor…", "The computer is slow to answer; trying again…")
      : undefined;
    return {
      skeleton: placeholder,
      label: slow,
      lead: slow && placeholder && !pillReports ? <StatusLine label={slow} busy /> : undefined,
      node: renderProgress(slow ?? loadingLabel),
    };
  }
  if (query.data !== undefined && (presentation === "paused" || presentation === "stale-error")) {
    if (!staleFailure || !staleVisible || fetching) return { node: null, skeleton: false };
    const refresh = () => {
      if (query.isFetching || !query.refetch) return;
      void Promise.resolve(query.refetch()).then((result) => {
        // A refresh the user asked for reports its own failure briefly; the line itself stays.
        if (toasts && (result as { error?: unknown } | undefined)?.error)
          showToast({ tone: "danger", message: copy("Yenilenemedi.", "Couldn't refresh."),
            action: { label: copy("Yeniden dene", "Retry"), onPress: refresh } });
      }).catch(() => undefined);
    };
    return { skeleton: false, node: (
      <StatusLine tone="warning"
        label={copy("Son yüklenen hâli gösteriliyor; yenilenemedi.", "Showing the last loaded version; it could not be refreshed.")}
        action={query.refetch ? { label: copy("Yenile", "Refresh"), onPress: refresh } : undefined} />
    ) };
  }
  // Without a network nothing can load or reconnect: say so once instead of spinning.
  if (showOffline)
    return { skeleton: false, node: loading === "none" ? null : (
      <StateView
        size={stateSize()}
        tone="warning"
        title={copy("Çevrimdışısın", "You're offline")}
        description={copy(
          "Wi-Fi’ye veya mobil veriye bağlan. Bağlantı gelince içerik kendiliğinden yüklenecek.",
          "Connect to Wi-Fi or mobile data. This loads by itself when you're back online.",
        )}
      />
    ) };
  // A quiet reconnect is still a load: keep the same placeholder (the pill shows the link state).
  if (reconnecting && presentation === "error" && !waitingForLink) {
    const label = explainRetry ? copy("Yeniden bağlanılıyor…", "Reconnecting…") : undefined;
    return {
      skeleton: placeholder,
      label,
      // The placeholder alone would look like a first load that never ends.
      lead: label && placeholder && !pillReports ? <StatusLine label={label} busy /> : undefined,
      node: renderProgress(label ?? loadingLabel),
    };
  }
  if (presentation === "paused" || waitingForLink) {
    const waitingSize = stateSize();
    return { skeleton: false, node: (
      <StateView
        size={waitingSize}
        tone="warning"
        title={copy("Bağlantı bekleniyor", "Waiting for a connection")}
        description={waitingSize !== "region" ? undefined : copy(
          "Bilgisayarına yeniden ulaşıldığında içerik kendiliğinden yüklenecek.",
          "This loads by itself when your computer is reachable again.",
        )}
        action={{ label: copy("Bağlantıları yönet", "Manage connections"), onPress: manageConnections }}
      />
    ) };
  }
  if (presentation === "error") {
    const retry =
      !repair && kind !== "unsupported" && query.refetch
        ? { label: copy("Yeniden dene", "Retry"), onPress: () => {
          if (!query.isFetching) void (connection.retry ?? query.refetch)?.();
        }, busy: query.isFetching }
        : undefined;
    return { skeleton: false, node: (
      <StateView
        size={stateSize()}
        tone={readTimedOut || repair ? "warning" : "danger"}
        title={readTimedOut
          ? copy("Bilgisayardan zamanında yanıt gelmedi", "The computer took too long to respond")
          : errorTitle(kind, copy, offline)}
        description={readTimedOut ? undefined : errorMessage(query.error, copy, undefined, { read: true })}
        action={repairAction ?? retry}
      />
    ) };
  }
  // An empty result caused by search or filters is the shared no-results state (mascot, the list's
  // wording, Clear search / Clear filters), compact when the caller asked for a compact state.
  if (presentation === "empty" && noResults && (noResults.searching || noResults.filtered))
    return { skeleton: false, node: <NoResults {...noResults} compact={noResults.compact ?? (size === "compact" || (!size && compact))} /> };
  const requested = emptyIllustration ?? (searching ? "search-empty" : undefined);
  const emptySize = stateSize(!!requested);
  // Every region-sized "nothing here yet" carries the shared empty mascot unless the caller chose
  // its own art; section rows stay icon-only.
  const illustration = requested ?? (emptySize === "region" ? "inbox-empty" : undefined);
  return { skeleton: false, node: presentation === "empty" ? (
    <StateView
      size={emptySize}
      illustration={illustration}
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
