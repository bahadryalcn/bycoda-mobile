import { useRef, useState } from "react";
import type { CrewDefinition, CrewRun } from "@/remote/contracts/crews";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { Body, Field, FormActions, MutationState, Notice, Stack } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import { identifier } from "../shared/format";

export function StartCrewEditor({
  definition,
  projectId,
  onClose,
}: {
  definition: CrewDefinition;
  projectId: string;
  onClose: () => void;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [machineId] = useState(machine?.id);
  const [prompt, setPrompt] = useState("");
  const [requestId] = useState(identifier);
  const [submitted, setSubmitted] = useState(false);
  const sending = useRef(false);
  const start = useHostMutation<CrewRun>("crews.start", ["crews", projectId]);
  const supported =
    machine?.id === machineId && machine?.capabilities?.includes("crews.tasks.v1") === true;
  const { requestClose } = useSheetGuard({ dirty: !!prompt, pending: start.isPending, onClose });
  // After any uncertain result keep the request ID and exact payload frozen. The run list is the reconciliation source.
  const submit = () => {
    if (
      !supported ||
      submitted ||
      sending.current ||
      !prompt.trim() ||
      prompt.length > 12000 ||
      useMachines.getState().activeId !== machineId
    )
      return;
    sending.current = true;
    setSubmitted(true);
    start.mutate(
      { projectId, definitionId: definition.id, prompt, requestId },
      {
        onSuccess: onClose,
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  };
  return (
    <Stack>
      <Body muted>
        {copy("Ekip", "Crew")}: {definition.name}
      </Body>
      <Field
        label={copy("Ekibin teslim edeceği sonuç", "Desired crew delivery")}
        value={prompt}
        onChangeText={setPrompt}
        multiline
        editable={!start.isPending && !submitted && supported}
        error={
          prompt.length > 12000
            ? copy("En fazla 12.000 karakter girin.", "Enter no more than 12,000 characters.")
            : undefined
        }
      />
      {!supported && (
        <Notice
          tone="info"
          message={copy(
            "Ekip çalıştırmak için bilgisayardaki bycoda uygulamasını güncelleyin.",
            "Update bycoda on this computer to start crew work.",
          )}
        />
      )}
      {submitted && !start.isPending && start.isError && (
        <Notice
          tone="warning"
          message={copy(
            "İstek yinelenmedi. Çalışmalar listesini yenileyip bu işin oluşup oluşmadığını kontrol edin.",
            "The request was not repeated. Refresh the work list to check whether this run was created.",
          )}
        />
      )}
      <FormActions
        feedback={<MutationState mutation={start} />}
        submitLabel={copy("Ekip çalışmasını başlat", "Start crew work")}
        busy={start.isPending}
        disabled={
          !supported || submitted || start.isPending || !prompt.trim() || prompt.length > 12000
        }
        cancelDisabled={start.isPending}
        cancelLabel={copy("Kapat", "Close")}
        onCancel={requestClose}
        onSubmit={() =>
          confirmAction(
            copy("Ekip çalışmasını başlat", "Start crew work"),
            copy(
              "Koordinatör bilgisayarda yeni bir oturum açacak ve işi ekibe dağıtabilecek.",
              "The coordinator will start a new conversation on the computer and may delegate work to crew members.",
            ),
            copy("Başlat", "Start"),
            submit,
            undefined,
            "default",
          )
        }
      />
    </Stack>
  );
}
