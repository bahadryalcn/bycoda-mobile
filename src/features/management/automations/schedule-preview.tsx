import { useState } from "react";
import type { HostAutomationInput } from "@/domain/types";
import type { AutomationSchedulePreview } from "@/remote/types";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { Body, Button, MutationState, Notice, Stack } from "@/ui/primitives";
import { stamp } from "../shared/format";
import { validSchedulePreview } from "./schedule-model";

type Schedule = Pick<HostAutomationInput, "scheduleKind" | "minute" | "time" | "dayOfWeek">;

export function SchedulePreview({ schedule, valid, disabled }: { schedule: Schedule; valid: boolean; disabled: boolean }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const preview = useHostMutation<AutomationSchedulePreview>("automations.preview");
  const [requested, setRequested] = useState("");
  const identity = JSON.stringify([machine?.id, schedule]);
  const current = requested === identity;
  const supported = machine?.capabilities?.includes("automations") === true;
  const unsupported = current && preview.error?.message.includes("Unsupported host method");
  const result = validSchedulePreview(preview.data) ? preview.data : undefined;
  return <Stack>
    <Button tone="quiet" label={copy("Zamanlamayı önizle", "Preview schedule")} busy={preview.isPending}
      disabled={disabled || !valid || !supported || preview.isPending || !!unsupported} onPress={() => {
        if (disabled || !valid || !supported || preview.isPending) return;
        setRequested(identity);
        preview.mutate({ schedule });
      }} />
    {unsupported ? <Notice tone="info" message={copy("Zamanlama önizlemesi için bilgisayardaki bycoda uygulamasını güncelleyin.", "Update bycoda on this computer to preview schedules.")} />
      : current && <MutationState mutation={preview} />}
    {current && preview.isSuccess && !result && <Notice tone="warning" message={copy("Bilgisayar geçerli bir zamanlama önizlemesi döndürmedi. Yeniden deneyin.", "The computer returned an invalid schedule preview. Try again.")} />}
    {current && preview.isSuccess && result && <Body muted>
      {copy("Sonraki (cihaz saati)", "Next (device time)")}: {stamp(result.nextRunAt)} · {copy("Bilgisayar saat dilimi", "Computer time zone")}: {result.timeZone}
    </Body>}
  </Stack>;
}
