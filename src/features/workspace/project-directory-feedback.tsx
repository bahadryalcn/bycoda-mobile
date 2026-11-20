import { router } from "expo-router";
import { View } from "react-native";
import { QueryState, StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMachineStatus } from "@/ui/machine-bar";
import { queryOwnsRegion } from "./query-region";
import type { QueryStateProps } from "@/ui/component-props";

type FeedbackProps = QueryStateProps & { readiness?: string; privacyUnavailable?: boolean };

/** True when the directory has nothing to show yet and one centered state must own the region. */
export function directoryOwnsRegion({ query, empty, readiness, privacyUnavailable }: FeedbackProps) {
  if (query.error) return true;
  return !!privacyUnavailable || readiness === "waiting" || queryOwnsRegion(query, !!empty);
}

/** Directory errors, privacy synchronization and reconnect each have one centered presentation owner. */
export function ProjectDirectoryFeedback({
  readiness, privacyUnavailable, ...props
}: FeedbackProps) {
  const copy = useCopy();
  const { phase } = useMachineStatus();
  // Auth/identity and other actual query failures keep their precise recovery.
  if (props.query.error) return <QueryState {...props} />;
  if (privacyUnavailable) return <StateView
    illustration="connect-computer"
    title={copy("Proje listesi eşitlenmeli", "The project list needs a sync")}
    description={copy(
      "Proje listesini eşitlemek için bu bilgisayarda bycoda’yı aç. Korunan gruplar gizli kalır.",
      "Open bycoda on this computer to sync the project directory. Protected groups stay hidden.",
    )}
    action={props.query.refetch ? {
      label: copy("Yenile", "Refresh"),
      busy: props.query.isFetching,
      onPress: () => { if (!props.query.isFetching) void props.query.refetch?.(); },
    } : undefined}
  />;
  // While the link is being checked (cold start, return from background) or is up, the directory is
  // loading; "waiting for a connection" would contradict the computer pill above it.
  if (readiness === "waiting" && phase !== "checking" && phase !== "connected") return <StateView
    illustration="unreachable"
    title={copy("Bağlantı bekleniyor", "Waiting for a connection")}
    description={copy(
      "Bilgisayarına yeniden ulaşıldığında içerik kendiliğinden yüklenecek.",
      "This loads by itself when your computer is reachable again.",
    )}
    action={{ label: copy("Bağlantıları yönet", "Manage connections"), onPress: props.onManageConnections ?? (() => router.push("/machines")) }}
  />;
  // Right after a computer switch the new directory has no data and its read is idle or paused until
  // the client settles; the generic presentation of that is blank, so show the loading state instead.
  if (readiness === "waiting") return <QueryState {...props} query={{
    ...props.query, fetchStatus: "fetching", isEnabled: undefined, isPending: true, isLoading: true, status: "pending",
  }} />;
  return <QueryState {...props} />;
}

/**
 * Renders the feedback as the list's empty region so it is centered in the remaining area;
 * nothing is rendered above data.
 */
export function ProjectDirectorySlot(props: FeedbackProps) {
  // The list is empty here, so cached empty data must not hide a failed read behind a blank region.
  const query = props.query.error ? { ...props.query, data: undefined } : props.query;
  // A stable, non-collapsable container: Fabric crashes ("Unable to find view for viewState …
  // isLayoutOnly") when a flattened list-empty wrapper gains children while the state switches.
  return <View collapsable={false} style={{ flexGrow: 1 }}>
    {directoryOwnsRegion(props) ? <ProjectDirectoryFeedback {...props} query={query} /> : null}
  </View>;
}
