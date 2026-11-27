import Eye from "lucide-react-native/icons/eye";
import FileText from "lucide-react-native/icons/file-text";
import Minus from "lucide-react-native/icons/minus";
import Plus from "lucide-react-native/icons/plus";
import Trash2 from "lucide-react-native/icons/trash-2";
import { RowOptionsSheet, type MenuAction } from "@/ui/overflow-menu";
import { useCopy } from "@/ui/copy";
import { GitFileRow } from "./git-file-row";
import { gitFileRowActions, type GitFileRowAction } from "./git-file-actions-model";
import type { GitChangedFile } from "./wire";

/** Changed-file row: stage in the row, every other action (discard, …) in the list's one options sheet. Rows do not swipe. */
export function GitFileSwipeRow({
  file,
  staged,
  busy,
  onPreview,
  onStage,
  onOptions,
}: {
  file: GitChangedFile;
  staged: boolean;
  busy: boolean;
  onPreview: () => void;
  onStage: () => void;
  /** Opens the list-level options sheet for this file (long press, named accessibility action). */
  onOptions: () => void;
}) {
  return <GitFileRow file={file} staged={staged} busy={busy} onPreview={onPreview} onStage={onStage} onLongPress={onOptions} />;
}

/**
 * The one options sheet for the changed-file list: the panel keeps the selected file, so a long
 * list renders a single sheet instead of one per row. Rows use the shared `RowOptionsSheet`, which
 * tints glyphs for both themes and colours the destructive Discard row.
 */
export function GitFileOptionsSheet({
  target,
  busy,
  onClose,
  onPreview,
  onStage,
  onOpen,
  onDiscard,
}: {
  target: { file: GitChangedFile; staged: boolean } | null;
  busy: boolean;
  onClose: () => void;
  onPreview: (file: GitChangedFile, staged: boolean) => void;
  onStage: (file: GitChangedFile, staged: boolean) => void;
  onOpen: (file: GitChangedFile) => void;
  onDiscard: (file: GitChangedFile) => void;
}) {
  const copy = useCopy();
  const actions: MenuAction[] = target
    ? gitFileRowActions(target.file, target.staged).map((action: GitFileRowAction): MenuAction => {
        const { file, staged } = target;
        switch (action) {
          case "stage":
            return { key: action, label: copy("Stage’e al", "Stage"), icon: <Plus />, disabled: busy, onPress: () => onStage(file, staged) };
          case "unstage":
            return { key: action, label: copy("Stage’den çıkar", "Unstage"), icon: <Minus />, disabled: busy, onPress: () => onStage(file, staged) };
          case "preview":
            return { key: action, label: copy("Değişiklikleri göster", "View changes"), icon: <Eye />, opens: true, disabled: busy, onPress: () => onPreview(file, staged) };
          case "open":
            return { key: action, label: copy("Dosyayı aç", "Open file"), icon: <FileText />, opens: true, disabled: busy, onPress: () => onOpen(file) };
          case "discard":
            return { key: action, label: copy("Değişiklikleri at", "Discard changes"), icon: <Trash2 />, destructive: true, reviewed: true, disabled: busy, onPress: () => onDiscard(file) };
        }
      })
    : [];
  const name = target ? target.file.relative.replaceAll("\\", "/").split("/").pop() || target.file.relative : "";
  return <RowOptionsSheet visible={!!target} title={name} subtitle={target?.file.relative !== name ? target?.file.relative : undefined} actions={actions} onClose={onClose} />;
}
