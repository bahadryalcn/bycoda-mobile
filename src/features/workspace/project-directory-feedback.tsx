import { View } from "react-native";
import { Body, Notice, QueryState, StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMachineStatus } from "@/ui/machine-bar";
import { useConnectionFeedbackOwner } from "@/ui/connection-feedback-scope";
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
  const { phase, status, reason } = useMachineStatus();
  const startupFailed = readiness === "waiting" && phase === "startup-failed" && !props.query.error;
  const startupFeedback = useConnectionFeedbackOwner(startupFailed, !!props.shareConnectionFeedback);
  // Auth/identity and other actual query failures keep their precise recovery.
  if (props.query.error) return <QueryState {...props} />;
  if (startupFailed)
    return startupFeedback.visible
      ? <StateView compact={props.compact} tone="warning" title={status} description={reason} />
      : <></>;
  if (privacyUnavailable) {
    const title = copy("Proje listesi eşitlenmeli", "The project list needs a sync");
    const description = copy(
      "Proje listesini eşitlemek için bu bilgisayarda bycoda’yı aç. Korunan gruplar gizli kalır.",
      "Open bycoda on this computer to sync the project directory. Protected groups stay hidden.",
    );
    const action = props.query.refetch ? {
      label: copy("Yenile", "Refresh"),
      busy: props.query.isFetching,
      onPress: () => { if (!props.query.isFetching) void props.query.refetch?.(); },
    } : undefined;
    return props.compact
      ? <Notice message={title} onRetry={action?.onPress} retryLabel={action?.label} retrying={action?.busy}>
          <Body muted>{description}</Body>
        </Notice>
      : <StateView illustration="connect-computer" title={title} description={description} action={action} />;
  }
  // While the link is being checked (cold start, return from background) or is up, the directory is
  // loading; "waiting for a connection" would contradict the computer pill above it.
  if (readiness === "waiting" && phase !== "checking" && phase !== "connected")
    return <QueryState {...props} query={{ ...props.query, fetchStatus: "paused" }} />;
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
