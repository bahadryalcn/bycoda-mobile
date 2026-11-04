import { router } from "expo-router";
import { useContext, useEffect, useState } from "react";
import { Empty, ErrorNotice, Loading, Notice, Skeleton } from "./feedback";
import { useCopy } from "./copy";
import { errorMessage, remoteErrorKind } from "./error-message";
import { getQueryPresentation } from "./query-presentation";
import type { QueryStateProps, MutationStateProps } from "./component-props";
import { Body } from "./typography";
import { SheetGuardContext } from "./sheet-guard-context";

export function QueryState({
  query,
  empty,
  emptyTitle,
  emptyDetail,
  emptyAction,
  onManageConnections,
  loading = "list",
  loadingLabel,
}: QueryStateProps) {
  const copy = useCopy();
  const sheet = useContext(SheetGuardContext);
  const presentation = getQueryPresentation(query, !!empty);
  const kind = remoteErrorKind(query.error);
  const repair = kind === "auth" || kind === "identity";
  const repairAction = repair ? {
    label: copy("Bağlantıları yönet", "Manage connections"),
    onPress: onManageConnections ?? (() => {
      const navigate = () => router.push("/machines");
      if (sheet) (sheet.requestCloseStackThen ?? sheet.requestCloseThen)(navigate);
      else navigate();
    }),
  } : undefined;
  if (presentation === "loading")
    return loading === "none" ? null : loading === "inline" ? (
      <Loading label={loadingLabel} />
    ) : (
      <Skeleton variant={loading} label={loadingLabel} />
    );
  if (presentation === "paused")
    return (
      <Notice
        tone="warning"
        message={
          query.data !== undefined
            ? copy(
                "Bağlantı bekleniyor. Son alınan bilgiler gösteriliyor.",
                "Waiting for a connection. Showing the last received information.",
              )
            : copy(
                "Bağlantı bekleniyor. Bağlantı geri geldiğinde yeniden denenecek.",
                "Waiting for a connection. Loading will resume when it returns.",
              )
        }
      />
    );
  if (presentation === "stale-error") {
    const unsupported = kind === "unsupported";
    const cachedMessage = copy(
      "Bilgiler yenilenemedi. Son alınan bilgiler gösteriliyor.",
      "Could not refresh. Showing the last received information.",
    );
    return (
      <Notice
        tone="warning"
        message={unsupported || repair ? `${errorMessage(query.error, copy)} ${cachedMessage}` : cachedMessage}
        action={repairAction}
        retrying={query.isFetching}
        onRetry={
          !unsupported && !repair && query.refetch
            ? () => {
                if (!query.isFetching) void query.refetch?.();
              }
            : undefined
        }
      />
    );
  }
  if (presentation === "error") {
    return (
      <ErrorNotice
        error={query.error}
        retrying={query.isFetching}
        onRetry={
          !repair && kind !== "unsupported" && query.refetch
            ? () => {
                if (!query.isFetching) void query.refetch?.();
              }
            : undefined
        }
        action={repairAction}
      />
    );
  }
  return presentation === "empty" ? (
    <Empty
      title={
        emptyTitle ??
        (typeof empty === "string" ? empty : copy("Henüz bir kayıt yok", "Nothing here yet"))
      }
      detail={emptyDetail}
      action={emptyAction}
    />
  ) : null;
}

export function MutationState({ mutation, pending, success }: MutationStateProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  // Translating the acknowledgement must not restart its completed operation.
  const hasSuccess = !!success;
  useEffect(() => {
    if (!mutation.isSuccess || !hasSuccess) {
      setShowSuccess(false);
      return;
    }
    setShowSuccess(true);
    const timer = setTimeout(() => setShowSuccess(false), 5000);
    return () => clearTimeout(timer);
  }, [mutation.isSuccess, mutation.submittedAt, hasSuccess]);
  if (mutation.isPending) return pending ? <Loading label={pending} /> : null;
  if (mutation.isError || mutation.error) return <ErrorNotice error={mutation.error} />;
  return mutation.isSuccess && success && showSuccess ? (
    <Body muted accessibilityLiveRegion="polite" style={{ alignSelf: "flex-start" }}>{success}</Body>
  ) : null;
}
