import type { FileActionsProps, FileActionDraft } from "./file-actions-types";
import { View } from "react-native";
import { useFormDraft } from "@/state/form-draft";
import {
  Body,
  FormActions,
  SegmentedControl,
  IdentifierField,
  ErrorNotice,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { useProjectRefresh, workspaceStyles } from "./shared";

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
  useMobileTheme();
  const copy = useCopy();
  const form = useFormDraft<FileActionDraft>({
    operation: "rename_path",
    name: entry.name,
    destination: "",
  });
  const { operation, name, destination } = form.values;
  const refreshProject = useProjectRefresh(projectId);
  const path = joinHostPath(root, entry.path);
  return (
    <Sheet
      visible
      size="form"
      title={entry.name}
      dirty={form.dirty}
      dismissible={!action.isPending}
      onClose={() => {
        if (!action.isPending) onClose();
      }}
    >
      <View style={workspaceStyles.stack}>
        <Body mono muted selectable numberOfLines={3}>
          {path}
        </Body>
        <SegmentedControl
          label={copy("İşlem", "Operation")}
          value={operation}
          disabled={action.isPending}
          onChange={(value) => form.setField("operation", value)}
          options={(["rename_path", "copy_path", "move_path", "delete_path"] as const).map((value) => ({
            value,
            label:
                value === "rename_path"
                  ? copy("Adını değiştir", "Rename")
                  : value === "copy_path"
                    ? copy("Kopyala", "Copy")
                    : value === "move_path"
                      ? copy("Taşı", "Move")
                      : copy("Sil", "Delete")
          }))}
        />
        {operation === "rename_path" ? (
          <IdentifierField
            label={copy("Yeni ad", "New name")}
            value={name}
            editable={!action.isPending}
            onChangeText={(value) => form.setField("name", value)}
          />
        ) : operation === "delete_path" ? (
          <Body>{`${copy("Bilgisayardan silinecek:", "This will be deleted on your computer:")} ${entry.path}${entry.isDir ? copy(" ve içindeki dosyalar", " and its contents") : ""}`}</Body>
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
          submitLabel={
            operation === "delete_path"
              ? copy("Silmeyi onayla", "Confirm deletion")
              : copy("Uygula", "Apply")
          }
          tone={operation === "delete_path" ? "danger" : "primary"}
          busy={action.isPending}
          disabled={operation === "rename_path" && (!name.trim() || name === entry.name)}
          onSubmit={() => {
            const args =
              operation === "rename_path"
                ? { path, name: name.trim() }
                : operation === "delete_path"
                  ? { path }
                  : { from: path, destParent: joinHostPath(root, destination.trim()) };
            void action
              .mutateAsync({ command: operation, args })
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
