import { useRef, useState } from "react";
import type { Block } from "@/domain/types";
import { useMachines } from "@/state/machines";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useCopy } from "@/ui/copy";
import { Body, Field, FormActions, Notice, Stack } from "@/ui/primitives";
import { ErrorText } from "@/features/workspace/shared";
import type { TranscriptBlockProps } from "@/features/workspace/session-types";
import { readyPlan, reviewedPlanCommand } from "./plan-review-model";

export function PlanReview({ block, scope, disabled, onCommand, onClose }:
  Pick<TranscriptBlockProps, "block" | "scope" | "disabled" | "onCommand"> & { onClose: () => void }) {
  const copy = useCopy();
  const [opening] = useState<Block>(block);
  const [text, setText] = useState(block.plan?.approvedText || block.text);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const attempted = useRef(false);
  const machine = useMachines((state) => state.machines.find((entry) => entry.id === scope.machineId));
  const supported = machine?.capabilities?.includes("sessions.plan.review") === true;
  const changed = block.text !== opening.text || !readyPlan(block);
  const { requestClose } = useSheetGuard({ dirty: text !== opening.text, pending, onClose });
  const build = async () => {
    if (disabled || pending || attempted.current || changed) return;
    if (useMachines.getState().activeId !== scope.machineId) {
      setError(new Error(copy("Seçili bilgisayar değişti. Planı yeniden açın.", "The selected computer changed. Reopen the plan.")));
      return;
    }
    try {
      const command = supported ? reviewedPlanCommand(scope.sessionId, opening, block, text) :
        { type: "send", sessionId: scope.sessionId, text: opening.text, intent: "build", planBlockId: opening.id };
      attempted.current = true;
      setPending(true);
      await onCommand(command);
      onClose();
    } catch (cause) {
      // A transport failure may still mean the host accepted this build. Never replay here.
      setError(cause);
    } finally { setPending(false); }
  };
  return <Stack>
    <Body muted>{copy("Planı okumak çalışmayı başlatmaz. Uygula eylemi bu metni onaylar ve çalışmayı başlatır.", "Reading does not start work. Build approves this text and starts implementation.")}</Body>
    {!supported ? <Notice tone="warning" message={copy("Bu bilgisayarda plan düzenleme desteklenmiyor. Kayıtlı planı inceleyip uygulayabilirsiniz.", "This computer does not support editing plans. You can review and build the stored plan.")} /> : null}
    {changed ? <Notice tone="warning" message={copy("Plan değişti. Güncel planı incelemek için kapatıp yeniden açın.", "The plan changed. Close and reopen to review the current plan.")} /> : null}
    <Field label={copy("Onaylanacak plan", "Plan to approve")} value={text} onChangeText={setText}
      multiline maxLength={256_000} editable={supported && !disabled && !pending && !attempted.current}
      style={{ minHeight: 220 }} />
    <FormActions submitLabel={copy("Planı uygula", "Build this plan")} onSubmit={() => { void build(); }}
      disabled={disabled || changed || !text.trim() || attempted.current} busy={pending}
      onCancel={requestClose} feedback={<ErrorText error={error} />} />
  </Stack>;
}
