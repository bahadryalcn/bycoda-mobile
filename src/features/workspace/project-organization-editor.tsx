import ArrowUp from "lucide-react-native/icons/arrow-up";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import type { useFormDraft } from "@/state/form-draft";
import { useCopy } from "@/ui/copy";
import {
  Body,
  ErrorText,
  Field,
  FormActions,
  IconButton,
  MultiSelectField,
  NavigationGroup,
  NavigationRow,
  Row,
  ScreenList,
  SelectField,
  Sheet,
} from "@/ui/primitives";
import {
  moveOrganizationId,
  type OrganizationSnapshot,
} from "./project-organization-model";

export function OrganizationOrderRow({ label, index, total, disabled, onMove }: { label: string; index: number; total: number; disabled: boolean; onMove: (step: number) => void }) {
 const { colors } = useMobileTheme();
 const copy = useCopy();
 return <Row style={{ flexWrap: "nowrap", gap: space.xs }}>
   <Body style={{ flex: 1, minWidth: 0 }}>{label}</Body>
   <IconButton label={`${copy("Yukarı taşı", "Move up")}: ${label}`} disabled={disabled || index === 0} onPress={() => onMove(-1)}><ArrowUp size={18} color={colors.muted}/></IconButton>
   <IconButton label={`${copy("Aşağı taşı", "Move down")}: ${label}`} disabled={disabled || index === total - 1} onPress={() => onMove(1)}><ArrowDown size={18} color={colors.muted}/></IconButton>
 </Row>;
}

export type OrganizationEditor = { kind: string; folderId?: string };
export const emptyOrganizationForm = () => ({
  name: "",
  groupId: "",
  sessionId: "",
  folderId: "",
  parentId: "",
  target: "root",
  list: "loose",
  ids: [] as string[],
});
export type OrganizationForm = ReturnType<typeof useFormDraft<ReturnType<typeof emptyOrganizationForm>>>;

/** The full-screen or form sheet that edits one organization change; the owner applies it. */
export function OrganizationEditorSheet({
  editor,
  snapshot: visible,
  form,
  disabled,
  busy,
  pendingAction,
  error,
  onOpen: open,
  onApply: apply,
  onClose,
}: {
  editor: OrganizationEditor | null;
  snapshot: OrganizationSnapshot | null;
  form: OrganizationForm;
  disabled: boolean;
  busy: boolean;
  pendingAction: string;
  error: unknown;
  onOpen: (editor: OrganizationEditor) => void;
  onApply: (change: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const copy = useCopy();
  const submit = () => {
    if (!editor) return;
    const kind = editor.kind;
    if (kind === "projectName" || kind === "groupName") apply({ kind, name: form.values.name });
    else if (kind === "projectGroup") apply({ kind, groupId: form.values.groupId || null });
    else if (kind === "folderCreate")
      apply({
        kind,
        name: form.values.name,
        sessionIds: form.values.ids,
        ...(form.values.parentId ? { parentId: form.values.parentId } : {}),
      });
    else if (kind === "folderName")
      apply({ kind, folderId: editor.folderId, name: form.values.name });
    else if (kind === "folderMove")
      apply({
        kind,
        folderId: editor.folderId,
        target:
          form.values.target === "into"
            ? { kind: "into", id: form.values.parentId }
            : { kind: form.values.target },
      });
    else if (kind === "folderOrder") apply({ kind, folderIds: form.values.ids });
    else if (kind === "folderSessions")
      apply({ kind, folderId: editor.folderId, sessionIds: form.values.ids });
    else if (kind === "sessionOrder")
      apply({ kind, list: form.values.list, sessionIds: form.values.ids });
    else if (kind === "sessionMove")
      apply({ kind, sessionId: form.values.sessionId, folderId: form.values.folderId || null });
  };
  const ordering =
    editor && ["folderOrder", "folderSessions", "sessionOrder"].includes(editor.kind);
  const labels = new Map(
    editor?.kind === "folderOrder"
      ? visible?.folders.map((row) => [row.id, row.name])
      : visible?.sessions.map((row) => [row.id, row.title]),
  );
  const editTitle =
    editor?.kind === "folderCreate"
      ? copy("Konuşma klasörü oluştur", "Create conversation folder")
      : editor?.kind === "projectName"
        ? copy("Proje görünen adı", "Project display name")
        : editor?.kind === "groupName"
          ? copy("Grup adı", "Group name")
          : editor?.kind === "projectGroup"
            ? copy("Proje grubu", "Project group")
            : copy("Organizasyonu düzenle", "Edit organization");
  return (
  <Sheet
    visible={!!editor && !!visible}
    size={ordering ? "full" : "form"}
    scroll={!ordering}
    title={editTitle}
    dirty={form.dirty}
    dismissible={!busy}
    onClose={onClose}
  >
    {ordering ? (
      <>
        <ScreenList
          data={form.values.ids}
          keyExtractor={(id) => id}
          header={
            editor?.kind === "sessionOrder" ? (
              <SelectField
                label={copy("Konuşma listesi", "Conversation list")}
                value={form.values.list}
                disabled={disabled}
                options={[
                  { value: "loose", label: copy("Diğerleri", "Others") },
                  { value: "pinned", label: copy("Sabitlenmiş", "Pinned") },
                ]}
                onChange={(list) => {
                  form.setField("list", list);
                  form.setField("ids", [
                    ...new Set([
                      ...(visible?.order[list as "loose" | "pinned"] ?? []),
                      ...(visible?.sessions.map((row) => row.id) ?? []),
                    ]),
                  ]);
                }}
              />
            ) : null
          }
          renderItem={({ item, index }) => <OrganizationOrderRow label={labels.get(item) || item} index={index} total={form.values.ids.length} disabled={!!disabled} onMove={(step) => form.setField("ids", moveOrganizationId(form.values.ids, item, step))} />}
        />
        <FormActions
          submitLabel={copy("Sıralamayı kaydet", "Save order")}
          disabled={disabled || !form.dirty}
          busy={busy && pendingAction === "primary"}
          onSubmit={submit}
        />
      </>
    ) : (
      <>
        {editor?.kind === "folder" ? (
          <NavigationGroup>
            {["folderName", "folderMove", "folderSessions"].map((kind) => (
              <NavigationRow
                key={kind}
                label={
                  kind === "folderName"
                    ? copy("Klasör adı", "Folder name")
                    : kind === "folderMove"
                      ? copy("Klasörü taşı", "Move folder")
                      : copy("Konuşmaları sırala", "Order conversations")
                }
                disabled={disabled}
                onPress={() => open({ kind, folderId: editor.folderId })}
              />
            ))}
          </NavigationGroup>
        ) : null}
        {editor &&
        ["projectName", "groupName", "folderName", "folderCreate"].includes(editor.kind) ? (
          <Field
            label={copy("Görünen ad", "Display name")}
            value={form.values.name}
            maxLength={160}
            editable={!disabled}
            onChangeText={(value) => form.setField("name", value)}
          />
        ) : null}
        {editor?.kind === "projectGroup" ? (
          <SelectField
            label={copy("Proje grubu", "Project group")}
            value={form.values.groupId}
            disabled={disabled}
            searchable
            options={[
              { value: "", label: copy("Diğerleri", "Others") },
              ...(visible?.groups.map((row) => ({ value: row.id, label: row.name })) ?? []),
            ]}
            onChange={(value) => form.setField("groupId", value)}
          />
        ) : null}
        {editor?.kind === "folderCreate" ? (
          <MultiSelectField
            label={copy("Konuşmalar", "Conversations")}
            values={form.values.ids}
            disabled={disabled}
            searchable
            options={
              visible?.sessions.map((row) => ({ value: row.id, label: row.title || row.id })) ??
              []
            }
            onChange={(value) => form.setField("ids", value)}
          />
        ) : null}
        {editor?.kind === "folderMove" ? (
          <SelectField
            label={copy("Klasör konumu", "Folder position")}
            value={form.values.target}
            disabled={disabled}
            options={[
              { value: "root", label: copy("En üst düzey", "Top level") },
              { value: "pinned", label: copy("Sabitlenmiş", "Pinned") },
              { value: "into", label: copy("Başka klasörün içinde", "Inside another folder") },
            ]}
            onChange={(value) => form.setField("target", value)}
          />
        ) : null}
        {editor?.kind === "folderCreate" ||
        (editor?.kind === "folderMove" && form.values.target === "into") ? (
          <SelectField
            label={copy("Üst klasör", "Parent folder")}
            value={form.values.parentId}
            disabled={disabled}
            options={[
              { value: "", label: copy("En üst düzey", "Top level") },
              ...(visible?.folders
                .filter((row) => row.id !== editor?.folderId)
                .map((row) => ({ value: row.id, label: row.name })) ?? []),
            ]}
            onChange={(value) => form.setField("parentId", value)}
          />
        ) : null}
        {editor?.kind === "sessionMove" ? (
          <>
            <SelectField
              label={copy("Konuşma", "Conversation")}
              value={form.values.sessionId}
              disabled={disabled}
              searchable
              options={
                visible?.sessions.map((row) => ({
                  value: row.id,
                  label: row.title || row.id,
                })) ?? []
              }
              onChange={(value) => form.setField("sessionId", value)}
            />
            <SelectField
              label={copy("Hedef klasör", "Destination folder")}
              value={form.values.folderId}
              disabled={disabled}
              options={[
                { value: "", label: copy("Diğerleri", "Others") },
                ...(visible?.folders.map((row) => ({ value: row.id, label: row.name })) ?? []),
              ]}
              onChange={(value) => form.setField("folderId", value)}
            />
          </>
        ) : null}
        {editor && editor.kind !== "folder" ? (
          <FormActions
            submitLabel={copy("Organizasyon değişikliğini kaydet", "Save organization change")}
            disabled={disabled || !form.dirty}
            busy={busy && pendingAction === "primary"}
            onSubmit={submit}
          />
        ) : null}
      </>
    )}
    <ErrorText error={error} />
  </Sheet>
  );
}
