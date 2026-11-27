import type { CrewDefinition, SavedCrewAgent } from "@/remote/contracts/crews";
import { useActiveMachine, useMachines } from "@/state/machines";
import type { useHostMutation } from "@/state/queries";
import Copy from "lucide-react-native/icons/copy";
import Pencil from "lucide-react-native/icons/pencil";
import Trash2 from "lucide-react-native/icons/trash-2";
import { useCopy } from "@/ui/copy";
import Play from "lucide-react-native/icons/play";
import { IconButton, MutationState, StatusText } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { RecordCard } from "@/ui/record-card";
import { identifier } from "../shared/format";
import { useMenuGlyph } from "../shared/record-bits";
import { crewAccent } from "./identity-model";
import { MemberAvatars } from "./member-avatars";
import { MemberLines } from "./member-lines";
import { iconSize } from "@/ui/tokens";
import { RecordConfirmationSheet, useRecordConfirmation } from "../shared/use-record-confirmation";

/** A saved crew: member marks, scope, start-work command and its secondary actions. */
export function CrewDefinitionCard({
  value,
  roleLabel,
  busy,
  editorOpen,
  executionSupported,
  deleteSupported,
  machineId,
  projectId,
  isScopeCurrent,
  remove,
  library,
  onStart,
  onEdit,
}: {
  value: CrewDefinition;
  roleLabel: (role: CrewDefinition["agents"][number]["role"]) => string;
  busy: boolean;
  editorOpen: boolean;
  executionSupported: boolean;
  deleteSupported: boolean;
  machineId?: string;
  projectId: string | null;
  isScopeCurrent: () => boolean;
  remove: ReturnType<typeof useHostMutation>;
  /** Saved library members, for each member's Library/Customized state. */
  library?: readonly SavedCrewAgent[];
  onStart: (definition: CrewDefinition) => void;
  onEdit: (definition: CrewDefinition) => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const glyph = useMenuGlyph();
  const machine = useActiveMachine();
  // A crew that changes while the sheet is open is reported, never deleted unseen.
  const { confirm, review } = useRecordConfirmation(
    { id: value.id, title: value.name, status: value.projectId ?? "", updatedAt: value.updatedAt },
    machine?.name || copy("Bağlı bilgisayar", "Connected computer"),
    busy || editorOpen,
  );
  return (<>
    <RecordCard
      title={value.name}
      status={
        value.projectId ? undefined : <StatusText label={copy("Bilgisayar geneli", "Computer-wide")} />
      }
      metadata={copy("{p0} üye", "{p0} members", { p0: value.agents.length })}
      details={<MemberLines agents={value.agents} roleLabel={roleLabel} library={library} />}
      preview={
        <MemberAvatars
          agents={value.agents}
          accent={crewAccent(value.appearance)}
          maxVisible={5}
          size={28}
        />
      }
      menu={
        <IconButton
          label={copy("İş başlat", "Start work")}
          disabled={!executionSupported || busy || editorOpen}
          onPress={() => onStart(value)}
        >
          <Play size={iconSize.action} color={colors.accent} />
        </IconButton>
      }
      actions={{
        label: copy("Ekip işlemleri", "Crew actions"),
        busy: remove.isPending && remove.variables?.definitionId === value.id,
        items: [
          {
            key: "edit",
            icon: glyph(Pencil),
            label: copy("Düzenle", "Edit"),
            disabled: busy || editorOpen,
            onPress: () => onEdit(value),
          },
          {
            key: "copy",
            icon: glyph(Copy),
            label: copy("Kopyasını oluştur", "Create a copy"),
            disabled: busy || editorOpen,
            onPress: () => onEdit({ ...structuredClone(value), id: identifier(), updatedAt: 0 }),
          },
          {
            key: "delete",
            icon: glyph(Trash2, true),
            label: copy("Sil", "Delete"),
            destructive: true,
            disabled: !deleteSupported || busy || editorOpen,
            onPress: () =>
              confirm(
                copy("Ekibi sil", "Delete crew"),
                copy(
                  "Kayıtlı ekip silinir. Ekibi kullanan çalışma veya görev varsa bilgisayar silmeyi engeller.",
                  "The saved crew will be deleted. The computer blocks deletion while work or tasks still use it.",
                ),
                copy("Sil", "Delete"),
                () => {
                  if (useMachines.getState().activeId !== machineId || !isScopeCurrent()) return;
                  remove.mutate({
                    projectId,
                    definitionId: value.id,
                    expectedUpdatedAt: value.updatedAt,
                  });
                },
              ),
          },
        ],
      }}
    >
      {remove.variables?.definitionId === value.id ? <MutationState mutation={remove} /> : null}
    </RecordCard>
    <RecordConfirmationSheet review={review} />
  </>);
}
