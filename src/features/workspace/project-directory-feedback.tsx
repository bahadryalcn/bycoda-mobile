import { router } from "expo-router";
import { Notice, QueryState } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { QueryStateProps } from "@/ui/component-props";

/** Directory errors, privacy synchronization and reconnect each have one presentation owner. */
export function ProjectDirectoryFeedback({
  readiness, privacyUnavailable, ...props
}: QueryStateProps & { readiness?: string; privacyUnavailable?: boolean }) {
  const copy = useCopy();
  // Auth/identity and other actual query failures keep their precise recovery.
  if (props.query.error) return <QueryState {...props} />;
  if (privacyUnavailable) return <Notice
    message={copy(
      "Proje listesini eşitlemek için bu bilgisayarda bycoda’yı aç. Korunan gruplar gizli kalır.",
      "Open bycoda on this computer to sync the project directory. Protected groups stay hidden.",
    )}
    retryLabel={copy("Yenile", "Refresh")}
    retrying={props.query.isFetching}
    onRetry={props.query.refetch ? () => { if (!props.query.isFetching) void props.query.refetch?.(); } : undefined}
  />;
  if (readiness === "waiting") return <Notice
    message={copy("Bağlantı bekleniyor. Bağlantı geri geldiğinde yeniden denenecek.", "Waiting for a connection. Loading will resume when it returns.")}
    action={{ label: copy("Bağlantıları yönet", "Manage connections"), onPress: props.onManageConnections ?? (() => router.push("/machines")) }}
  />;
  return <QueryState {...props} />;
}
