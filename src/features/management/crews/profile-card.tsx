import { agentPresentation } from "../shared/agent-presentation";
import type { SavedCrewAgent } from "@/remote/contracts/crews";
import { useMachines } from "@/state/machines";
import type { useHostMutation } from "@/state/queries";
import Pencil from "lucide-react-native/icons/pencil";
import Trash2 from "lucide-react-native/icons/trash-2";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { ActionMenu, Badge, Body, MutationState } from "@/ui/primitives";
import { RecordCard } from "@/ui/record-card";
import { joinMeta, RecordTrailing, useMenuGlyph } from "../shared/record-bits";
import { handleLabel } from "./identity-model";
import { MemberAvatars } from "./member-avatars";
import { memberModelSource } from "./model";

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
  return (
    <RecordCard
      title={value.name}
      status={<Badge label={roleLabel(value.role)} />}
      metadata={joinMeta([
        handleLabel(value.handle),
        memberModelSource(value, copy) ?? (candidate && agentPresentation(candidate.harness, candidate.model)),
        value.projectId ? copy("Bu proje", "This project") : copy("Bilgisayar geneli", "Host-wide"),
      ])}
      preview={value.instructions ? <Body muted numberOfLines={2}>{value.instructions}</Body> : null}
      details={<Body>{value.instructions}</Body>}
      menu={
        <RecordTrailing>
          <ActionMenu
            label={copy("Kütüphane üyesi işlemleri", "Library member actions")}
            busy={remove.isPending && remove.variables?.agentId === value.id}
            actions={[
              { key: "edit", icon: glyph(Pencil), label: copy("Düzenle", "Edit"), disabled: busy || editorOpen,
                onPress: () => onEdit(value) },
              { key: "delete", icon: glyph(Trash2, true), label: copy("Sil", "Delete"), destructive: true,
                disabled: busy || editorOpen,
                onPress: () =>
                  confirmAction(
                    copy("Üyeyi kütüphaneden sil", "Delete library member"),
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
            ]}
          />
        </RecordTrailing>
      }
    >
      {remove.variables?.agentId === value.id ? <MutationState mutation={remove} /> : null}
    </RecordCard>
  );
}
