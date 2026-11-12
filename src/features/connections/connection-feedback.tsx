import { ErrorNotice, MutationState } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { ConnectionOperation } from "./connection-types";

/**
 * The entry or management surface owns this operation's presentation, not its execution.
 * A failed attempt is a danger Notice with Retry; the action control alone shows progress and
 * success is a toast.
 */
export function ConnectionFeedback({ operation, success, onRetry }: {
  operation: ConnectionOperation; success?: string; onRetry?: () => void;
}) {
  const copy = useCopy();
  if (onRetry && !operation.isPending && (operation.isError || operation.error))
    return <ErrorNotice error={operation.error} onRetry={onRetry} retryLabel={copy("Yeniden dene", "Retry")} />;
  return <MutationState mutation={operation} pending={copy("İşlem sürüyor…", "Working…")} success={success} />;
}
