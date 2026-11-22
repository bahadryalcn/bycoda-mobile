import { useState } from "react";
import type { FileActionsProps, FileActionDraft } from "./file-actions-types";
import { View } from "react-native";
import { useFormDraft } from "@/state/form-draft";
import {
  Body,
  Button,
  FormActions,
  SegmentedControl,
  IdentifierField,
  ErrorNotice,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { useProjectRefresh } from "./shared";

function joinHostPath(root: string, path: string) {
  return `${root.replace(/\\/g, "/").replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

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
  const form = useFormDraft<FileActionDraft>({
    operation: "rename_path",
    name: entry.name,
    destination: "",
  });
  const { operation, name, destination } = form.values;
  // Reviewing a deletion is a step, not an edit, so it never reads as unsaved changes.
  const [deleting, setDeleting] = useState(false);
  const refreshProject = useProjectRefresh(projectId);
  const path = joinHostPath(root, entry.path);
  return (
    <Sheet
      visible
      size={deleting ? "compact" : "form"}
      title={entry.name}
      dirty={form.dirty}
      dismissible={!action.isPending}
      onClose={() => {
        if (!action.isPending) onClose();
      }}
    >
      <View style={uiStyles.stack}>
        <Body mono muted selectable>
          {path}
        </Body>
        {!deleting ? (
          <SegmentedControl
            label={copy("İşlem", "Operation")}
            value={operation}
            disabled={action.isPending}
            onChange={(value) => form.setField("operation", value)}
            options={(["rename_path", "copy_path", "move_path"] as const).map((value) => ({
              value,
              label:
                  value === "rename_path"
                    ? copy("Adını değiştir", "Rename")
                    : value === "copy_path"
                      ? copy("Kopyala", "Copy")
                      : copy("Taşı", "Move"),
            }))}
          />
        ) : null}
        {deleting ? (
          <Body>{`${copy("Bilgisayardan silinecek:", "This will be deleted on your computer:")} ${entry.path}${entry.isDir ? copy(" ve içindeki dosyalar", " and its contents") : ""}`}</Body>
        ) : operation === "rename_path" ? (
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
        {/* Delete is destructive, so it is not one of the view segments: a separate step with its own confirmation. */}
        {!deleting ? (
          <Button
            label={copy("Sil", "Delete")}
            tone="danger"
            disabled={action.isPending}
            onPress={() => setDeleting(true)}
          />
        ) : null}
        <FormActions
          feedback={<ErrorNotice error={action.error} />}
          submitLabel={deleting ? copy("Silmeyi onayla", "Confirm deletion") : copy("Uygula", "Apply")}
          tone={deleting ? "danger" : "primary"}
          busy={action.isPending}
          disabled={!deleting && operation === "rename_path" && (!name.trim() || name === entry.name)}
          cancelLabel={deleting ? copy("Vazgeç", "Cancel") : undefined}
          cancelDisabled={action.isPending}
          onCancel={deleting ? () => setDeleting(false) : undefined}
          onSubmit={() => {
            const args = deleting
              ? { path }
              : operation === "rename_path"
                ? { path, name: name.trim() }
                : { from: path, destParent: joinHostPath(root, destination.trim()) };
            void action
              .mutateAsync({ command: deleting ? "delete_path" : operation, args })
              .then(() => {
                void refreshProject();
                onCompleted();
              })
              .catch(() => {});
          }}
        />
      </View>
    </Sheet>
  );
}
