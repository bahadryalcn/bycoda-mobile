import { agentPresentation } from "../shared/agent-presentation";
import type { SavedCrewAgent } from "@/remote/contracts/crews";
import { useActiveMachine, useMachines } from "@/state/machines";
import type { useHostMutation } from "@/state/queries";
import Pencil from "lucide-react-native/icons/pencil";
import Trash2 from "lucide-react-native/icons/trash-2";
import { useCopy } from "@/ui/copy";
import { Body, MutationState, StatusText } from "@/ui/primitives";
import { RecordCard } from "@/ui/record-card";
import { joinMeta, useMenuGlyph } from "../shared/record-bits";
import { handleLabel } from "./identity-model";
import { memberModelSource } from "./model";
import { RecordConfirmationSheet, useRecordConfirmation } from "../shared/use-record-confirmation";

/** A library member: role badge, provider mark, model and its edit/delete menu. */
export function CrewProfileCard({ value, roleLabel, busy, editorOpen, machineId, projectId, isScopeCurrent, remove, onEdit }: {
  value: SavedCrewAgent;
  roleLabel: (role: SavedCrewAgent["role"]) => string;
  busy: boolean;
  editorOpen: boolean;
  machineId?: string;
  projectId: string | null;
  isScopeCurrent: () => boolean;
  remove: ReturnType<typeof useHostMutation>;
  onEdit: (profile: SavedCrewAgent) => void;
}) {
  const copy = useCopy();
  const glyph = useMenuGlyph();
  const candidate = value.candidates[0];
  const machine = useActiveMachine();
  const { confirm, review } = useRecordConfirmation(
    { id: value.id, title: value.name, status: value.projectId ?? "", updatedAt: value.updatedAt },
    machine?.name || copy("Bağlı bilgisayar", "Connected computer"),
    busy || editorOpen,
  );
  return (<>
    <RecordCard
      title={value.name}
      status={<StatusText label={roleLabel(value.role)} />}
      metadata={joinMeta([
        handleLabel(value.handle),
        memberModelSource(value, copy) ?? (candidate && agentPresentation(candidate.harness, candidate.model)),
        value.projectId ? copy("Bu proje", "This project") : copy("Bilgisayar geneli", "Computer-wide"),
      ])}
      details={value.instructions ? <Body>{value.instructions}</Body> : undefined}
      actions={{
            label: copy("Kütüphane üyesi işlemleri", "Library member actions"),
            busy: remove.isPending && remove.variables?.agentId === value.id,
            items: [
              { key: "edit", icon: glyph(Pencil), label: copy("Düzenle", "Edit"), disabled: busy || editorOpen,
                onPress: () => onEdit(value) },
              { key: "delete", icon: glyph(Trash2, true), label: copy("Sil", "Delete"), destructive: true,
                disabled: busy || editorOpen,
                onPress: () =>
                  confirm(
                    copy("Kütüphane üyesini sil", "Delete library member"),
                    copy(
                      "Kütüphane profili silinir. Ekiplerdeki kopyaları korunur.",
                      "The library profile will be deleted. Copies in crews are kept.",
                    ),
                    copy("Sil", "Delete"),
                    () => {
                      if (useMachines.getState().activeId === machineId && isScopeCurrent())
                        remove.mutate({ projectId, agentId: value.id });
                    },
                  ) },
            ],
      }}
    >
      {remove.variables?.agentId === value.id ? <MutationState mutation={remove} /> : null}
    </RecordCard>
    <RecordConfirmationSheet review={review} />
  </>);
}
