import Trash2 from "lucide-react-native/icons/trash-2";
import type { Note } from "@/domain/types";
import { useCopy } from "@/ui/copy";
import { usePrivateContentAccess } from "@/ui/private-access";
import { ActionMenu } from "@/ui/primitives";
import { SwipeActions } from "@/ui/swipe-actions";
import { RecordConfirmationSheet, useRecordConfirmation } from "../shared/use-record-confirmation";
import { NoteSummaryRow } from "./note-summary-row";

export function NoteLibraryRow({
  note,
  projectName,
  machineName,
  projectId,
  busy,
  canDelete,
  onOpen,
  onDelete,
}: {
  note: Note;
  projectName?: string;
  machineName?: string;
  projectId: string | null;
  busy: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onDelete: (id: string, expectedUpdatedAt: number) => void;
}) {
  const copy = useCopy();
  const access = usePrivateContentAccess();
  const title = note.title.trim() || copy("Başlıksız", "Untitled");
  const available = canDelete && access.allowed && access.check();
  const { confirm, review } = useRecordConfirmation(
    // Switching the list scope retires a review even when the same note remains visible.
    { id: note.id, title, updatedAt: note.updatedAt, status: projectId ?? "" },
    machineName,
    busy,
    !available,
  );
  const deleteLabel = copy("Notu sil", "Delete note");
  const deleteAction = {
    key: "delete",
    label: deleteLabel,
    icon: <Trash2 size={18} />,
    destructive: true,
    opens: true,
    disabled: busy || !available,
    onPress: () => {
      if (!available || !access.check()) return;
      confirm(
        deleteLabel,
        copy("Bu not bilgisayardan kalıcı olarak silinecek.", "This note will be permanently deleted from the computer."),
        copy("Sil", "Delete"),
        () => { if (access.check()) onDelete(note.id, note.updatedAt); },
      );
    },
  };
  return (
    <>
      <SwipeActions actions={[deleteAction]} disabled={busy || !available}>
        <NoteSummaryRow
          note={note}
          projectName={projectName}
          disabled={busy}
          onPress={onOpen}
          trailing={available ? <ActionMenu
            label={copy("Diğer işlemler", "More actions")}
            subtitle={title}
            actions={[deleteAction]}
            reserveTouchTarget
          /> : undefined}
        />
      </SwipeActions>
      <RecordConfirmationSheet review={review} />
    </>
  );
}
