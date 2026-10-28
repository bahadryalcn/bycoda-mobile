import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { useEffect, useMemo, useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { reviewedOperationStore } from "@/state/reviewed-operation-store";
import { reviewedMachine, isReviewedMachine } from "@/state/reviewed-machine";
import { useCopy } from "@/ui/copy";
import { useSheetGuard } from "@/ui/sheet-guard";
import {
  Body,
  Button,
  ErrorText,
  Field,
  FormActions,
  NavigationGroup,
  NavigationRow,
  Notice,
  QueryState,
  ScreenList,
  SelectField,
  Sheet,
  Stack,
} from "@/ui/primitives";
import type { SessionScope } from "./session-types";
import {
  readDesktopPreferences,
  readDesktopPreferenceStatus,
  readComputerTemplate,
  type ComputerTemplate,
  type DesktopPreferencesSnapshot,
  type DesktopPreferenceStatus,
  type PreferenceDefaults,
} from "./desktop-preferences-model";
type Props = {
  scope: SessionScope;
  projectId: string;
  onClose: () => void;
  onInsert?: (body: string) => void;
  embedded?: boolean;
};
type Editor =
  | { kind: "template"; revision: string; template: ComputerTemplate; creating: boolean }
  | { kind: "provider"; revision: string; harness: string; scope: "project" | "global" };
export function DesktopPreferences({
  scope,
  projectId,
  onClose,
  onInsert,
  embedded = false,
}: Props) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [opening] = useState(() => ({
    ...scope,
    projectId,
    environmentId: machine?.environmentId,
    machineName: machine?.name,
    reviewed: reviewedMachine(machine),
  }));
  const latest = useRef({ scope, projectId });
  latest.current = { scope, projectId };
  const current = () =>
    isReviewedMachine(opening.reviewed, useMachines.getState()) &&
    latest.current.scope.machineId === opening.machineId &&
    latest.current.scope.sessionId === opening.sessionId &&
    latest.current.projectId === opening.projectId;
  const supported =
    !!opening.environmentId &&
    current() &&
    !!machine?.capabilities?.includes("preferences.desktop.v1");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState("primary");
  const occupied = useRef(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [trigger, setTrigger] = useState("");
  const [modelId, setModelId] = useState("");
  const [defaults, setDefaults] = useState<PreferenceDefaults>({});
  const [providerBaseline, setProviderBaseline] = useState("");
  const dirty =
    editor?.kind === "template"
      ? name !== editor.template.name ||
        body !== editor.template.body ||
        trigger !== (editor.template.trigger ?? "")
      : !!editor && JSON.stringify([modelId, defaults]) !== providerBaseline;
  const closeEditor = useSheetGuard({
    dirty,
    pending: busy,
    onClose: () => setEditor(null),
  }).requestClose;
  const store = useMemo(
    () =>
      reviewedOperationStore(
        AsyncStorage,
        `bycoda.mobile.desktop-preference-operation.v1:${JSON.stringify([opening.machineId, opening.environmentId, opening.projectId, opening.sessionId])}`,
      ),
    [opening],
  );
  const [attempt, setAttempt] = useState<Awaited<ReturnType<typeof store.load>>>(null);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<DesktopPreferenceStatus>();
  useEffect(() => {
    let live = true;
    void store
      .load()
      .then(
        (value) => {
          if (live) setAttempt(value);
        },
        (cause) => {
          if (live) setError(cause);
        },
      )
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [store]);
  const params = { projectId: opening.projectId, sessionId: opening.sessionId };
  const query = useHostQuery<DesktopPreferencesSnapshot>(
    ["desktop-preferences", opening.projectId, opening.sessionId],
    "preferences.desktop.read",
    params,
    {
      enabled: supported,
      interval: 10000,
      queryFn: async (client, signal) =>
        readDesktopPreferences(
          await client.request("preferences.desktop.read", params, { signal }),
          opening.environmentId!,
          opening.sessionId,
        ),
    },
  );
  const detail = useHostMutation("preferences.desktop.template.read", null);
  const mutation = useHostMutation("preferences.desktop.patch", [
    "desktop-preferences",
    opening.projectId,
    opening.sessionId,
  ]);
  const statusQuery = useHostQuery<DesktopPreferenceStatus>(
    ["desktop-preference-status", opening.sessionId, attempt?.operationId],
    "preferences.desktop.status",
    { ...params, operationId: attempt?.operationId },
    {
      enabled: supported && !!attempt && attempt.environmentId === opening.environmentId,
      queryFn: async (client, signal) =>
        readDesktopPreferenceStatus(
          await client.request(
            "preferences.desktop.status",
            { ...params, operationId: attempt?.operationId },
            { signal },
          ),
          opening.environmentId!,
          opening.sessionId,
        ),
    },
  );
  const snapshot = supported && !query.isError ? query.data : undefined;
  const status = supported ? (receipt ?? statusQuery.data) : undefined;
  const disabled = !snapshot || loading || busy || !!attempt;
  const run = async (action: () => Promise<void>, actionKey = "primary") => {
    if (occupied.current || !supported) return;
    occupied.current = true;
    setPendingAction(actionKey);
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause);
    } finally {
      occupied.current = false;
      setBusy(false);
    }
  };
  const apply = (change: Record<string, unknown>, revision: string, actionKey = "primary") => {
    if (disabled || !snapshot) return;
    void run(async () => {
      if (!current()) return;
      setReceipt(undefined);
      const claimed = await store.claim({
        operationId: randomUUID(),
        environmentId: opening.environmentId!,
        digest: revision,
      });
      setAttempt(claimed.attempt);
      if (!claimed.claimed) return;
      if (!current()) {
        await store.clear(claimed.attempt.operationId);
        setAttempt(null);
        return;
      }
      const result = readDesktopPreferenceStatus(
        await mutation.mutateAsync({
          ...params,
          operationId: claimed.attempt.operationId,
          expectedRevision: revision,
          change,
        }),
        opening.environmentId!,
        opening.sessionId,
      );
      if (!current()) return;
      setReceipt(result);
      if (result.state === "applied") {
        setEditor(null);
        await query.refetch();
        await store.clear(claimed.attempt.operationId);
        setAttempt(null);
      }
    }, actionKey);
  };
  const openTemplate = (id: string) => {
    if (disabled || !snapshot) return;
    const reviewed = snapshot;
    void run(async () => {
      const template = readComputerTemplate(
        await detail.mutateAsync({
          ...params,
          templateId: id,
          expectedRevision: reviewed.revision,
        }),
        reviewed.revision,
        id,
      );
      if (!current()) return;
      setName(template.name);
      setBody(template.body);
      setTrigger(template.trigger ?? "");
      setEditor({ kind: "template", revision: reviewed.revision, template, creating: false });
    }, `template:${id}`);
  };
  const openProvider = (harness: string, scope: "project" | "global") => {
    if (disabled || !snapshot) return;
    const provider = snapshot.providers.find((row) => row.id === harness)!;
    const nextModel =
      (scope === "project" ? provider.projectModel : undefined) ??
      provider.globalModel ??
      provider.models[0]?.id ??
      "";
    const nextDefaults = scope === "project" ? provider.projectDefaults : provider.globalDefaults;
    setModelId(nextModel);
    setDefaults(nextDefaults);
    setProviderBaseline(JSON.stringify([nextModel, nextDefaults]));
    setEditor({ kind: "provider", revision: snapshot.revision, harness, scope });
  };
  const provider =
    editor?.kind === "provider"
      ? snapshot?.providers.find((row) => row.id === editor.harness)
      : undefined;
  const model = provider?.models.find((row) => row.id === modelId);
  const header = (
    <Stack>
      <Body muted>{opening.machineName}</Body>
      <Body muted>
        {copy(
          "Bilgisayar ayarları yalnızca gelecekteki konuşmalara uygulanır. Şablon eklemek mesaj göndermez.",
          "Computer defaults apply to future conversations. Inserting a template does not send a message.",
        )}
      </Body>
      {!supported ? (
        <Notice
          tone="warning"
          message={copy(
            "Açık konuşması olan bağlı ve desteklenen bir bilgisayar seçin.",
            "Choose a paired, supported computer with this conversation open.",
          )}
        />
      ) : (
        <QueryState query={query} empty={false} />
      )}
      <ErrorText error={error} />
      {attempt ? (
        <Stack>
          <Notice
            tone="warning"
            message={
              status?.state === "failed"
                ? copy(
                    "Değişiklik doğrulanamadı. Yenilemeden başka bir değişiklik göndermeyin.",
                    "Change could not be verified. Refresh before another change.",
                  )
                : copy(
                    "Kaydedilen işlem kontrol ediliyor. Bilinmeyen işlemler yeniden gönderilmez.",
                    "Checking the saved operation. Unknown operations are not sent again.",
                  )
            }
          />
          <Button busy={statusQuery.isFetching}
            label={copy("Durumu kontrol et", "Check status")}
            disabled={busy || !supported}
            onPress={() => {
              setReceipt(undefined);
              void statusQuery.refetch();
            }}
          />
          {status?.state === "applied" || status?.state === "failed" ? (
            <Button busy={busy && pendingAction === "secondary-1"}
              label={copy("Yenile ve devam et", "Refresh and continue")}
              onPress={() => {
                void run(async () => {
                  await query.refetch();
                  await store.clear(attempt.operationId);
                  setAttempt(null);
                  setReceipt(undefined);
                  setEditor(null);
                }, "secondary-1");
              }}
            />
          ) : null}
        </Stack>
      ) : null}
      {snapshot ? (
        <>
          <Notice
            tone="info"
            message={copy(
              "Kaydetmeden önce değişiklikler yeniden kontrol edilir. Diğer pencerelerle atomik kilit uygulanmaz.",
              "Changes are checked again before saving. Saving is not atomic across desktop windows.",
            )}
          />
          <Button
            label={copy("Bilgisayar şablonu ekle", "Add computer template")}
            disabled={disabled || snapshot.templates.length >= 100}
            onPress={() => {
              setName("");
              setBody("");
              setTrigger("");
              setEditor({
                kind: "template",
                revision: snapshot.revision,
                template: { id: randomUUID(), name: "", body: "" },
                creating: true,
              });
            }}
          />
          {!embedded ? (
            <NavigationGroup>
              {snapshot.providers.map((row) => (
                <NavigationRow
                  key={row.id}
                  label={row.id}
                  detail={
                    row.hidden
                      ? copy("Bu projede gizli", "Hidden in this project")
                      : (row.projectModel ?? row.globalModel)
                  }
                  disabled={disabled || !row.models.length}
                  onPress={() => openProvider(row.id, "project")}
                />
              ))}
              <NavigationRow
                label={copy("Proje varsayılanlarını sıfırla", "Restore project inheritance")}
                busy={busy && pendingAction === "reset"}
                disabled={disabled}
                onPress={() => apply({ kind: "projectReset" }, snapshot.revision, "reset")}
              />
            </NavigationGroup>
          ) : null}
          <Body>{copy("Bilgisayar şablonları", "Computer templates")}</Body>
          {!snapshot.templates.length ? (
            <Body muted>{copy("Henüz şablon yok", "No templates yet")}</Body>
          ) : null}
        </>
      ) : null}
    </Stack>
  );
  const content = (
    <ScreenList
      data={snapshot?.templates ?? []}
      keyExtractor={(row) => row.id}
      header={header}
      renderItem={({ item }) => (
        <NavigationRow
          label={item.name}
          busy={busy && pendingAction === `template:${item.id}`}
          detail={item.trigger ? `;${item.trigger}` : item.preview}
          disabled={disabled}
          onPress={() => openTemplate(item.id)}
        />
      )}
    />
  );
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
    <>
      {embedded ? (
        content
      ) : (
        <Sheet
          visible
          title={copy("Bilgisayar tercihleri", "Computer preferences")}
          size="full"
          scroll={false}
          onClose={editor ? closeEditor : onClose}
        >
          {content}
        </Sheet>
      )}
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
    </>
  );
}
