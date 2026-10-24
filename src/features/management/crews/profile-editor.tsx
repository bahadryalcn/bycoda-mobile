import { useRef, useState } from "react";
import type { HostModelCatalog } from "@/domain/types";
import type { CrewAgent, SavedCrewAgent } from "@/remote/contracts/crews";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { Body, MutationState, SelectField } from "@/ui/primitives";
import { MemberEditor } from "./member-editor";
import type { CrewCatalogRead } from "./presentation";

export function ProfileEditor({
  initial,
  projectId,
  catalog,
  catalogRead,
  onClose,
}: {
  initial: SavedCrewAgent;
  projectId: string;
  catalog?: HostModelCatalog;
  catalogRead?: CrewCatalogRead;
  onClose: () => void;
}) {
  const copy = useCopy();
  const [opening] = useState(() => structuredClone(initial));
  const [scope, setScope] = useState(opening.projectId ? "project" : "host");
  const machine = useActiveMachine();
  const [machineId] = useState(machine?.id);
  const supported =
    machine?.id === machineId && machine?.capabilities?.includes("crews.v1") === true;
  const save = useHostMutation<SavedCrewAgent>("crews.agent.save", ["crews", projectId]);
  const sending = useRef(false);
  const submit = (member: CrewAgent) => {
    if (!supported || sending.current || useMachines.getState().activeId !== machineId) return;
    sending.current = true;
    save.mutate(
      {
        projectId,
        agent: { ...member, projectId: scope === "project" ? projectId : undefined },
        expectedUpdatedAt: opening.updatedAt || undefined,
      },
      {
        onSuccess: onClose,
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  };
  return (
    <MemberEditor
      initial={opening}
      catalog={catalog}
      catalogRead={catalogRead}
      groupsSupported={machine?.capabilities?.includes("crews.agent-groups.v1") === true}
      busy={save.isPending}
      disabled={!supported}
      feedback={<MutationState mutation={save} />}
      onSave={submit}
      onClose={onClose}
      extraDirty={scope !== (opening.projectId ? "project" : "host")}
      extraFields={
        <>
          <SelectField
            label={copy("Kapsam", "Scope")}
            value={scope}
            onChange={setScope}
            disabled={!supported || save.isPending || !!opening.updatedAt}
            options={[
              { value: "project", label: copy("Bu proje", "This project") },
              {
                value: "host",
                label: copy("Bu bilgisayardaki tüm projeler", "All projects on this computer"),
              },
            ]}
          />
          <Body muted>
            {copy(
              "Ekipler bu profilin kendi kopyasını tutar. Profili değiştirmek var olan ekipleri değiştirmez.",
              "Crews retain their own copy of this profile. Editing it does not change existing crews.",
            )}
          </Body>
        </>
      }
    />
  );
}
