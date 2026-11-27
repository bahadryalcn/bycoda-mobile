import type { ComponentProps } from "react";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useCopy } from "@/ui/copy";
import { ErrorText, Field, FormActions, Notice, Sheet, Stack } from "@/ui/primitives";
import { TemplateInsertAction } from "@/features/management/templates/template-insert-action";
import { TemplateActionsMenu } from "@/features/management/templates/template-actions-menu";
import { DesktopPreferenceContext } from "./desktop-preference-context";
import type {
  ComputerTemplate,
  DesktopPreferencesSnapshot,
} from "./desktop-preferences-model";

/** Computer templates only: provider and model defaults are edited in bycoda on the computer. */
export type PreferenceEditor = { kind: "template"; revision: string; template: ComputerTemplate; creating: boolean };

function PreferenceEditorActions(props: ComponentProps<typeof FormActions>) {
  const { requestClose } = useSheetGuard({});
  return <FormActions {...props} onCancel={requestClose} />;
}

/** The editable values of the open editor; the owner keeps them so closing can be guarded. */
export type PreferenceEditorForm = {
  name: string;
  setName: (value: string) => void;
  body: string;
  setBody: (value: string) => void;
  trigger: string;
  setTrigger: (value: string) => void;
  dirty: boolean;
};

/** Template editor for computer preferences; the owner applies changes. */
export function DesktopPreferenceEditorSheet({
  computerName,
  editor,
  snapshot,
  form,
  disabled,
  busy,
  pendingAction,
  error,
  onApply: apply,
  onInsert,
  isCurrent: current,
  onClose,
  onCloseEditor: closeEditor,
}: {
  computerName: string;
  editor: PreferenceEditor | null;
  snapshot: DesktopPreferencesSnapshot | undefined;
  form: PreferenceEditorForm;
  disabled: boolean;
  busy: boolean;
  pendingAction: string;
  error: unknown;
  onApply: (change: Record<string, unknown>, revision: string, actionKey?: string) => void;
  onInsert?: (body: string) => void;
  isCurrent: () => boolean;
  onClose: () => void;
  onCloseEditor: () => void;
}) {
  const copy = useCopy();
  const { name, setName, body, setBody, trigger, setTrigger, dirty } = form;
  const editVisible = !!editor && !!snapshot;
  const templateValid =
    !!name.trim() &&
    name.length <= 160 &&
    !!body.trim() &&
    body.length <= 20000 &&
    (!trigger || /^[a-z0-9][a-z0-9-]{0,23}$/.test(trigger.replace(/^;/, "")));
  const templateChanged = editor?.kind === "template" && !!snapshot && snapshot.revision !== editor.revision;
  const templateActions = editor?.kind === "template" && !editor.creating ? (
    <TemplateActionsMenu templateId={editor.template.id} name={editor.template.name} revision={editor.revision}
      disabled={disabled || templateChanged} busy={busy && pendingAction === "delete-template"} isCurrent={current}
      onDelete={() => apply(
        { kind: "templateDelete", templateId: editor.template.id }, editor.revision, "delete-template",
      )} />
  ) : null;
  const footer =
    editor?.kind === "template" ? (
      <PreferenceEditorActions
        submitLabel={copy("Şablonu kaydet", "Save template")}
        disabled={disabled || templateChanged || !templateValid}
        busy={busy && pendingAction === "primary"}
        onSubmit={() =>
          apply(
            {
              kind: editor.creating ? "templateCreate" : "templateUpdate",
              templateId: editor.template.id,
              name,
              body,
              trigger,
            },
            editor.revision,
          )
        }
        feedback={<><ErrorText error={error} />
          {templateChanged ? <Notice tone="warning" message={copy(
            "Şablonlar değişti. Taslağını koru ve kaydetmeden önce güncel listeyi yeniden aç.",
            "Templates changed. Keep your draft and reopen the current list before saving.",
          )} /> : null}</>}
      />
    ) : null;
  return (
  <Sheet
    visible={editVisible}
    title={copy("Bilgisayar şablonu", "Computer template")}
    size="full"
    dirty={dirty}
    dismissible={!busy}
    onClose={closeEditor}
  >
    {footer}
    {snapshot ? <DesktopPreferenceContext computerName={computerName} snapshot={snapshot} /> : null}
    {editor?.kind === "template" && snapshot ? (
      <Stack>
        <Field
          label={copy("Şablon adı", "Template name")}
          value={name}
          onChangeText={setName}
          editable={!disabled}
        />
        <Field
          label={copy("Şablon tetikleyicisi", "Template trigger")}
          value={trigger}
          onChangeText={setTrigger}
          editable={!disabled}
          autoCapitalize="none"
        />
        <Field
          label={copy("Şablon metni", "Template text")}
          value={body}
          onChangeText={setBody}
          editable={!disabled}
          multiline
          maxLength={20000}
        />
        {!editor.creating ? (
          <>
            {onInsert ? (
              <TemplateInsertAction
                key={editor.template.id}
                secondaryAction={templateActions}
                disabled={
                  disabled ||
                  snapshot.revision !== editor.revision ||
                  name !== editor.template.name ||
                  body !== editor.template.body ||
                  trigger !== (editor.template.trigger ?? "")
                }
                onInsert={() => {
                  if (!current()) throw new Error(copy(
                    "Bu oturuma şu anda ekleme yapılamıyor. Taslağın değişmedi.",
                    "This session is not available for insertion. Your draft is unchanged.",
                  ));
                  onInsert(editor.template.body);
                  onClose();
                }}
              />
            ) : templateActions}
          </>
        ) : null}
      </Stack>
    ) : null}
  </Sheet>
  );
}
