import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Button } from "./buttons";
import { Empty, ErrorNotice, Loading, Notice, Skeleton } from "./feedback";
import { useCopy } from "./copy";
import { remoteErrorKind } from "./error-message";
import { getQueryPresentation } from "./query-presentation";
import type { QueryStateProps, MutationStateProps } from "./component-props";

export function QueryState({
  query,
  empty,
  emptyTitle,
  emptyDetail,
  emptyAction,
  loading = "list",
}: QueryStateProps) {
  const copy = useCopy();
  const presentation = getQueryPresentation(query, !!empty);
  if (presentation === "loading")
    return loading === "none" ? null : loading === "inline" ? (
      <Loading />
    ) : (
      <Skeleton variant={loading} />
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
  if (presentation === "stale-error")
    return (
      <Notice
        tone="warning"
        message={copy(
          "Bilgiler yenilenemedi. Son alınan bilgiler gösteriliyor.",
          "Could not refresh. Showing the last received information.",
        )}
        onRetry={
          query.refetch
            ? () => {
                query.refetch?.();
              }
            : undefined
        }
      />
    );
  if (presentation === "error") {
    const kind = remoteErrorKind(query.error);
    const repair = kind === "auth" || kind === "identity";
    return (
      <ErrorNotice
        error={query.error}
        onRetry={
          !repair && kind !== "unsupported" && query.refetch
            ? () => {
                query.refetch?.();
              }
            : undefined
        }
      >
        {repair ? (
          <Button
            label={copy("Bağlantıları yönet", "Manage connections")}
            onPress={() => router.push("/machines")}
          />
        ) : null}
      </ErrorNotice>
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
  useEffect(() => {
    if (!mutation.isSuccess || !success) {
      setShowSuccess(false);
      return;
    }
    setShowSuccess(true);
    const timer = setTimeout(() => setShowSuccess(false), 5000);
    return () => clearTimeout(timer);
  }, [mutation.isSuccess, success]);
  if (mutation.isPending) return pending ? <Loading label={pending} /> : null;
  if (mutation.isError || mutation.error) return <ErrorNotice error={mutation.error} />;
  return mutation.isSuccess && success && showSuccess ? (
    <Notice tone="success" message={success} />
  ) : null;
}
