import { MutationState } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { ConnectionOperation } from "./connection-types";

/** The entry or management surface owns this operation's presentation, not its execution. */
export function ConnectionFeedback({ operation, success }: { operation: ConnectionOperation; success?: string }) {
  const copy = useCopy();
  return <MutationState mutation={operation} pending={copy("İşlem sürüyor…", "Working…")} success={success} />;
}
