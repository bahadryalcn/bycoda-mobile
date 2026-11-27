import { useEffect, useEffectEvent } from "react";
import CopyIcon from "lucide-react-native/icons/copy";
import Trash2 from "lucide-react-native/icons/trash-2";
import type { Note } from "@/domain/types";
import { useCopy } from "@/ui/copy";
import { usePrivateContentAccess } from "@/ui/private-access";
import { ActionMenu } from "@/ui/primitives";
import { showToast } from "@/ui/toast";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import { RecordConfirmationSheet, useRecordConfirmation } from "../shared/use-record-confirmation";
import { NoteSummaryRow } from "./note-summary-row";
import { iconSize } from "@/ui/tokens";

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
  const readable = access.allowed && access.check();
  const clipboard = useClipboardFeedback(note.body, !busy && !!note.body.trim());
  const announceCopy = useEffectEvent((failed: boolean) => showToast(failed
    ? { tone: "danger", message: copy("Kopyalanamadı. Yeniden deneyin.", "Could not copy. Try again.") }
    : { message: copy("Kopyalandı", "Copied") }));
  // Reason: the menu and swipe rail close on press, so the copy result needs feedback outside them.
  useEffect(() => {
    if (clipboard.copied) announceCopy(false);
    else if (clipboard.error) announceCopy(true);
  }, [clipboard.copied, clipboard.error]);
  const copyAction = {
    key: "copy",
    label: copy("Notu kopyala", "Copy note"),
    icon: <CopyIcon size={iconSize.action} />,
    disabled: busy || clipboard.inFlight || !note.body.trim(),
    onPress: clipboard.copy,
  };
  const deleteLabel = copy("Notu sil", "Delete note");
  const deleteAction = {
    key: "delete",
    label: deleteLabel,
    icon: <Trash2 size={iconSize.action} />,
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
  // A read-only computer still allows copying.
  const actions = canDelete ? [copyAction, deleteAction] : [copyAction];
  return (
    <>
      <NoteSummaryRow
          note={note}
          projectName={projectName}
          disabled={busy}
          onPress={onOpen}
          trailing={readable ? <ActionMenu
            label={copy("Diğer işlemler", "More actions")}
            subtitle={title}
            actions={actions}
            reserveTouchTarget
          /> : undefined}
        />
      <RecordConfirmationSheet review={review} />
    </>
  );
}
