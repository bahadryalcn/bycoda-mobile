import { useState } from "react";
import type { FileActionsProps, FileActionDraft, FileOperation } from "./file-actions-types";
import { View } from "react-native";
import Pencil from "lucide-react-native/icons/pencil";
import CopyIcon from "lucide-react-native/icons/copy";
import FolderInput from "lucide-react-native/icons/folder-input";
import Trash2 from "lucide-react-native/icons/trash-2";
import { useFormDraft } from "@/state/form-draft";
import {
  Body,
  FormActions,
  IdentifierField,
  ErrorNotice,
  Sheet,
} from "@/ui/primitives";
import { ActionList } from "@/ui/overflow-menu";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { useProjectRefresh } from "./shared";

function joinHostPath(root: string, path: string) {
  return `${root.replace(/\\/g, "/").replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

type Step = FileOperation | "delete_path";

/**
 * A file's "…" opens a plain action list (Rename, Copy, Move, Delete). Each row opens its own
 * small step in the same sheet, whose one button names the result; only the step's fields count
 * as unsaved changes.
 */
export function FileActions({
  root,
  projectId,
  entry,
  onClose,
  onCompleted,
  action,
}: FileActionsProps) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const form = useFormDraft<FileActionDraft>({ name: entry.name, destination: "" });
  const { name, destination } = form.values;
  const [step, setStep] = useState<Step | null>(null);
  const refreshProject = useProjectRefresh(projectId);
  const path = joinHostPath(root, entry.path);
  const editing = step === "rename_path" || step === "copy_path" || step === "move_path";
  const submitLabel = step === "rename_path" ? copy("Yeniden adlandır", "Rename")
    : step === "copy_path" ? copy("Kopyala", "Copy")
    : step === "move_path" ? copy("Taşı", "Move")
    : copy("Silmeyi onayla", "Confirm deletion");
  const summary = (value: Step) => value === "rename_path"
    ? copy("{p0} adı {p1} olarak değiştirildi.", "Renamed {p0} to {p1}.", { p0: entry.name, p1: name.trim() })
    : value === "copy_path" ? copy("{p0} kopyalandı.", "Copied {p0}.", { p0: entry.name })
    : value === "move_path" ? copy("{p0} taşındı.", "Moved {p0}.", { p0: entry.name })
    : copy("{p0} silindi.", "Deleted {p0}.", { p0: entry.name });
  const submit = () => {
    if (!step) return;
    const args = step === "delete_path"
      ? { path }
      : step === "rename_path"
        ? { path, name: name.trim() }
        : { from: path, destParent: joinHostPath(root, destination.trim()) };
    const done = summary(step);
    void action
      .mutateAsync({ command: step, args })
      .then(() => {
        void refreshProject();
        onCompleted(done);
      })
      .catch(() => {});
  };
  return (
    <Sheet
      visible
      size={editing ? "form" : "compact"}
      title={entry.name}
      dirty={editing && form.dirty}
      dismissible={!action.isPending}
      onClose={() => {
        if (!action.isPending) onClose();
      }}
    >
      <View style={uiStyles.stack}>
        <Body mono muted selectable>
          {path}
        </Body>
        {!step ? (
          <ActionList actions={[
            { key: "rename", label: copy("Yeniden adlandır", "Rename"), icon: <Pencil />, opens: true, onPress: () => setStep("rename_path") },
            { key: "copy", label: copy("Kopyala", "Copy"), icon: <CopyIcon />, opens: true, onPress: () => setStep("copy_path") },
            { key: "move", label: copy("Taşı", "Move"), icon: <FolderInput />, opens: true, onPress: () => setStep("move_path") },
            { key: "delete", label: copy("Sil", "Delete"), icon: <Trash2 />, destructive: true, reviewed: true, onPress: () => setStep("delete_path") },
          ]} />
        ) : (
          <>
            {step === "delete_path" ? (
              <Body>{entry.isDir
                ? copy("{p0} ve içindeki dosyalar bilgisayardan silinecek.", "{p0} and its contents will be deleted on your computer.", { p0: entry.path })
                : copy("{p0} bilgisayardan silinecek.", "{p0} will be deleted on your computer.", { p0: entry.path })}</Body>
            ) : step === "rename_path" ? (
              <IdentifierField
                label={copy("Yeni ad", "New name")}
                value={name}
                editable={!action.isPending}
                onChangeText={(value) => form.setField("name", value)}
              />
            ) : (
              <IdentifierField
                label={copy("Hedef klasör (proje içinde)", "Destination folder (inside project)")}
                value={destination}
                editable={!action.isPending}
                onChangeText={(value) => form.setField("destination", value)}
                placeholder={copy("Kök için boş bırak", "Leave empty for project root")}
              />
            )}
            <FormActions
              feedback={<ErrorNotice error={action.error} />}
              submitLabel={submitLabel}
              tone={step === "delete_path" ? "danger" : "primary"}
              busy={action.isPending}
              dirty={editing && form.dirty}
              disabled={step === "rename_path" && (!name.trim() || name === entry.name)}
              cancelLabel={copy("Geri", "Back")}
              cancelDisabled={action.isPending}
              onCancel={() => setStep(null)}
              onSubmit={submit}
            />
          </>
        )}
      </View>
    </Sheet>
  );
}
