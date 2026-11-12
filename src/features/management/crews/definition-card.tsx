import type { CrewDefinition, SavedCrewAgent } from "@/remote/contracts/crews";
import { useMachines } from "@/state/machines";
import type { useHostMutation } from "@/state/queries";
import Copy from "lucide-react-native/icons/copy";
import Pencil from "lucide-react-native/icons/pencil";
import Play from "lucide-react-native/icons/play";
import Trash2 from "lucide-react-native/icons/trash-2";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { ActionMenu, Badge, IconButton, MutationState } from "@/ui/primitives";
import { RecordCard } from "@/ui/record-card";
import { useMobileTheme } from "@/ui/theme";
import { identifier } from "../shared/format";
import { joinMeta, RecordTrailing, useMenuGlyph } from "../shared/record-bits";
import { crewAccent } from "./identity-model";
import { MemberAvatars } from "./member-avatars";
import { MemberLines } from "./member-lines";

/** A saved crew: member marks, scope, start-work command and its secondary actions. */
export function CrewDefinitionCard({ value, roleLabel, busy, editorOpen, executionSupported, deleteSupported, machineId, projectId, remove, library, onStart, onEdit }: {
  value: CrewDefinition;
  roleLabel: (role: CrewDefinition["agents"][number]["role"]) => string;
  busy: boolean;
  editorOpen: boolean;
  executionSupported: boolean;
  deleteSupported: boolean;
  machineId?: string;
  projectId: string | null;
  remove: ReturnType<typeof useHostMutation>;
  /** Saved library members, for each member's Library/Customized state. */
  library?: readonly SavedCrewAgent[];
  onStart: (definition: CrewDefinition) => void;
  onEdit: (definition: CrewDefinition) => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const glyph = useMenuGlyph();
  return (
    <RecordCard
      title={value.name}
      status={<Badge label={value.projectId ? copy("Bu proje", "This project") : copy("Bilgisayar geneli", "Host-wide")} />}
      metadata={joinMeta([copy("{p0} üye", "{p0} members", { p0: value.agents.length })])}
      preview={<MemberAvatars agents={value.agents} accent={crewAccent(value.appearance)} />}
      details={<MemberLines agents={value.agents} roleLabel={roleLabel} library={library} />}
      menu={
        <RecordTrailing>
          <IconButton label={copy("İş başlat", "Start work")} disabled={!executionSupported || busy || editorOpen}
            onPress={() => onStart(value)}>
            <Play size={18} color={colors.accent} />
          </IconButton>
          <ActionMenu
            label={copy("Ekip işlemleri", "Crew actions")}
            busy={remove.isPending && remove.variables?.definitionId === value.id}
            actions={[
              { key: "edit", icon: glyph(Pencil), label: copy("Düzenle", "Edit"), disabled: busy || editorOpen,
                onPress: () => onEdit(value) },
              { key: "copy", icon: glyph(Copy), label: copy("Kopyasını oluştur", "Create a copy"), disabled: busy || editorOpen,
                onPress: () => onEdit({ ...structuredClone(value), id: identifier(), updatedAt: 0 }) },
              { key: "delete", icon: glyph(Trash2, true), label: copy("Sil", "Delete"), destructive: true,
                disabled: !deleteSupported || busy || editorOpen,
                onPress: () =>
                  confirmAction(
                    copy("Ekibi sil", "Delete crew"),
                    copy(
                      "Kayıtlı ekip tanımı silinir. Host devam eden çalışma veya görevler kullanıyorsa işlemi engeller.",
                      "The saved crew definition will be deleted. The host blocks deletion while active work or tasks still use it.",
                    ),
                    copy("Sil", "Delete"),
                    () => {
                      if (useMachines.getState().activeId !== machineId || useMachines.getState().selectedProjectId !== projectId) return;
                      remove.mutate({ projectId, definitionId: value.id, expectedUpdatedAt: value.updatedAt });
                    },
                  ) },
            ]}
          />
        </RecordTrailing>
      }
    >
      {remove.variables?.definitionId === value.id ? <MutationState mutation={remove} /> : null}
    </RecordCard>
  );
}
