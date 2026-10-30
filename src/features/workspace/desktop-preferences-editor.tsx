import type { Dispatch, SetStateAction } from "react";
import { useCopy } from "@/ui/copy";
import { Body, Button, ErrorText, Field, FormActions, SelectField, Sheet, Stack } from "@/ui/primitives";
import type {
  ComputerTemplate,
  DesktopPreferencesSnapshot,
  PreferenceDefaults,
} from "./desktop-preferences-model";

export type PreferenceEditor =
  | { kind: "template"; revision: string; template: ComputerTemplate; creating: boolean }
  | { kind: "provider"; revision: string; harness: string; scope: "project" | "global" };

/** The editable values of the open editor; the owner keeps them so closing can be guarded. */
export type PreferenceEditorForm = {
  name: string;
  setName: (value: string) => void;
  body: string;
  setBody: (value: string) => void;
  trigger: string;
  setTrigger: (value: string) => void;
  modelId: string;
  setModelId: (value: string) => void;
  defaults: PreferenceDefaults;
  setDefaults: Dispatch<SetStateAction<PreferenceDefaults>>;
  dirty: boolean;
};

/** Template and provider-default editor for computer preferences; the owner applies changes. */
export function DesktopPreferenceEditorSheet({
  editor,
  snapshot,
  form,
  disabled,
  busy,
  pendingAction,
  error,
  onApply: apply,
  onSwitchScope: openProvider,
  onInsert,
  isCurrent: current,
  onClose,
  onCloseEditor: closeEditor,
}: {
  editor: PreferenceEditor | null;
  snapshot: DesktopPreferencesSnapshot | undefined;
  form: PreferenceEditorForm;
  disabled: boolean;
  busy: boolean;
  pendingAction: string;
  error: unknown;
  onApply: (change: Record<string, unknown>, revision: string, actionKey?: string) => void;
  onSwitchScope: (harness: string, scope: "project" | "global") => void;
  onInsert?: (body: string) => void;
  isCurrent: () => boolean;
  onClose: () => void;
  onCloseEditor: () => void;
}) {
  const copy = useCopy();
  const { name, setName, body, setBody, trigger, setTrigger, modelId, setModelId, defaults, setDefaults, dirty } = form;
  const provider =
    editor?.kind === "provider"
      ? snapshot?.providers.find((row) => row.id === editor.harness)
      : undefined;
  const model = provider?.models.find((row) => row.id === modelId);
  const editVisible = !!editor && !!snapshot;
  const templateValid =
    !!name.trim() &&
    name.length <= 160 &&
    !!body.trim() &&
    body.length <= 20000 &&
    (!trigger || /^[a-z0-9][a-z0-9-]{0,23}$/.test(trigger.replace(/^;/, "")));
  const footer =
    editor?.kind === "template" ? (
      <FormActions
        submitLabel={copy("Şablonu kaydet", "Save template")}
        disabled={disabled || !templateValid}
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
        onCancel={closeEditor}
        feedback={<ErrorText error={error} />}
      />
    ) : (
      <FormActions
        submitLabel={copy("Varsayılanları kaydet", "Save defaults")}
        disabled={disabled || !modelId}
        busy={busy && pendingAction === "primary"}
        onSubmit={() => {
          if (editor?.kind === "provider")
            apply(
              {
                kind:
                  editor.scope === "project" ? "projectProviderDefaults" : "globalProviderDefaults",
                harness: editor.harness,
                model: modelId,
                defaults,
              },
              editor.revision,
            );
        }}
        onCancel={closeEditor}
        feedback={<ErrorText error={error} />}
      />
    );
  return (
  <Sheet
    visible={editVisible}
    title={
      editor?.kind === "template"
        ? copy("Bilgisayar şablonu", "Computer template")
        : copy("Gelecekteki konuşma varsayılanları", "Future conversation defaults")
    }
    size="full"
    onClose={closeEditor}
    footer={footer}
  >
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
            <Button
              busy={busy && pendingAction === "delete-template"}
                label={copy("Şablonu sil", "Delete template")}
              tone="danger"
              disabled={disabled}
              onPress={() =>
                apply(
                  { kind: "templateDelete", templateId: editor.template.id },
                  editor.revision,
                )
              }
            />
            {onInsert ? (
              <Button
                label={copy("Mesaja ekle", "Insert into message")}
                disabled={
                  disabled ||
                  snapshot.revision !== editor.revision ||
                  name !== editor.template.name ||
                  body !== editor.template.body ||
                  trigger !== (editor.template.trigger ?? "")
                }
                onPress={() => {
                  if (current()) {
                    onInsert(editor.template.body);
                    onClose();
                  }
                }}
              />
            ) : null}
          </>
        ) : null}
      </Stack>
    ) : null}
    {editor?.kind === "provider" && provider ? (
      <Stack>
        <Body>{provider.id}</Body>
        <SelectField
          label={copy("Ayar kapsamı", "Preference scope")}
          value={editor.scope}
          options={[
            { value: "project", label: copy("Bu proje", "This project") },
            {
              value: "global",
              label: copy(
                "Tüm projeler için bilgisayar varsayılanı",
                "Computer default for all projects",
              ),
            },
          ]}
          onChange={(value) => openProvider(editor.harness, value as "project" | "global")}
          disabled={disabled || dirty}
        />
        <SelectField
          label={copy("Model", "Model")}
          value={modelId}
          options={provider.models.map((row) => ({ value: row.id, label: row.name }))}
          onChange={(value) => {
            setModelId(value);
            setDefaults({});
          }}
          disabled={disabled}
        />
        <Button
          busy={busy && pendingAction === "default-provider"}
          label={copy("Varsayılan sağlayıcı ve model yap", "Use as default provider and model")}
          disabled={disabled || !model}
          onPress={() =>
            apply(
              {
                kind:
                  editor.scope === "project"
                    ? "projectDefaultProvider"
                    : "globalDefaultProvider",
                harness: provider.id,
                model: modelId,
              },
              editor.revision, "default-provider",
            )
          }
        />
        <Button
          label={copy(
            "Bu sağlayıcının varsayılan modeli yap",
            "Use as this provider’s default model",
          )}
          disabled={disabled || !model}
          onPress={() =>
            apply(
              {
                kind: editor.scope === "project" ? "projectDefaultModel" : "globalDefaultModel",
                harness: provider.id,
                model: modelId,
              },
              editor.revision, "default-model",
            )
          }
        />
        <SelectField
          label={copy("Çalışma modu", "Runtime mode")}
          value={defaults.runtimeMode ?? ""}
          options={[
            { value: "", label: copy("Devral", "Inherit") },
            ...provider.runtimeModes.map((value) => ({ value, label: value })),
          ]}
          onChange={(value) =>
            setDefaults((current) => ({ ...current, runtimeMode: value || undefined }))
          }
          disabled={disabled}
        />
        {model?.settings.map((setting) => (
          <SelectField
            key={setting.id}
            label={setting.label}
            value={(setting.effort ? defaults.effort : defaults.extras?.[setting.id]) ?? ""}
            options={[{ value: "", label: copy("Devral", "Inherit") }, ...setting.options]}
            onChange={(value) =>
              setDefaults((current) =>
                setting.effort
                  ? { ...current, effort: value || undefined }
                  : {
                      ...current,
                      extras: Object.fromEntries(
                        Object.entries({ ...current.extras, [setting.id]: value }).filter(
                          ([, value]) => !!value,
                        ),
                      ),
                    },
              )
            }
            disabled={disabled}
          />
        ))}
        {provider.unsupportedDefaults ? (
          <Body muted>
            {copy(
              "Desteklenmeyen kayıtlı değerler bu formda gösterilmez. Kaydetmek incelenen sağlayıcının varsayılanlarını değiştirir.",
              "Unsupported saved values are omitted from this form. Saving replaces the reviewed provider defaults.",
            )}
          </Body>
        ) : null}
      </Stack>
    ) : null}
  </Sheet>
  );
}
