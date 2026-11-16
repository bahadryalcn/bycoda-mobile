import { useRef, useState } from "react";
import type { Block } from "@/domain/types";
import { useMachines } from "@/state/machines";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useCopy } from "@/ui/copy";
import { PlanSteps } from "@/ui/plan-steps";
import { Badge, Body, Disclosure, Field, FormActions, Notice, Row, Stack } from "@/ui/primitives";
import { ErrorText } from "@/features/workspace/shared";
import type { TranscriptBlockProps } from "@/features/workspace/session-types";
import { planOutline, readyPlan, reviewedPlanCommand } from "./plan-review-model";

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
  const steps = planOutline(text);
  const editable = supported && !disabled && !pending && !attempted.current;
  const field = <Field label={steps.length ? copy("Plan metni", "Plan text") : copy("Onaylanacak plan", "Plan to approve")}
    info={copy("Uygula bu metni onaylar ve çalışmayı başlatır.", "Build approves this text and starts work.")}
    value={text} onChangeText={setText} multiline maxLength={256_000} editable={editable}
    style={{ minHeight: 220 }} />;
  return <Stack>
    <Row style={{ alignItems: "center" }}>
      <Badge tone={changed ? "default" : "warning"} label={changed ? copy("Güncel değil", "Out of date") : copy("Onayınızı bekliyor", "Needs your approval")} />
      {steps.length ? <Body muted>{copy("{p0} adım", "{p0} steps", { p0: steps.length })}</Body> : null}
    </Row>
    {!supported ? <Notice tone="warning" message={copy("Bu bilgisayar plan düzenlemeyi desteklemiyor; kayıtlı plan uygulanır.", "This computer can't edit plans; the stored plan is built.")} /> : null}
    {changed ? <Notice tone="warning" message={copy("Plan değişti. Kapatıp yeniden açın.", "The plan changed. Close and reopen it.")} /> : null}
    {steps.length ? <>
      <PlanSteps steps={steps} />
      <Disclosure label={supported ? copy("Plan metnini düzenle", "Edit plan text") : copy("Plan metni", "Plan text")}>{field}</Disclosure>
    </> : field}
    <FormActions submitLabel={copy("Planı uygula", "Build this plan")} onSubmit={() => { void build(); }}
      disabled={disabled || changed || !text.trim() || attempted.current} busy={pending}
      onCancel={requestClose} feedback={<ErrorText error={error} />} />
  </Stack>;
}
