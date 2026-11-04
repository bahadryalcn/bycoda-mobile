import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { Body, Disclosure, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { SubagentTarget } from "./subagent-model";

export function SubagentStopReview({ name, machineName, target, onClose, onConfirm }: {
  name: string; machineName: string; target: SubagentTarget; onClose: () => void; onConfirm: () => void;
}) {
  const copy = useCopy();
  return <ActionReviewSheet title={copy("Bu alt ajanı durdur", "Stop this subagent")} submitLabel={copy("Durdur", "Stop")} tone="danger" onClose={onClose} onConfirm={onConfirm}>
    <Stack><Body selectable>{machineName}</Body><Body selectable>{name}</Body>
      <Body muted>{copy("Ana oturum", "Parent session")}</Body><Body mono selectable>{target.sessionId}</Body>
      <Disclosure label={copy("Ayrıntılar", "Details")}><Body mono selectable>{target.runId}</Body><Body mono selectable>{target.blockId}</Body><Body mono selectable>{target.callId}</Body></Disclosure>
    </Stack>
  </ActionReviewSheet>;
}
