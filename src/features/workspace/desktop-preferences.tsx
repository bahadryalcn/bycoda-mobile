import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { useMemo, useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { reviewedOperationStore } from "@/state/reviewed-operation-store";
import { useReviewedOperation } from "@/state/use-reviewed-operation";
import { reviewedMachine, isReviewedMachine } from "@/state/reviewed-machine";
import { useCopy } from "@/ui/copy";
import {
  Body,
  Button,
  ErrorText,
  NavigationGroup,
  NavigationRow,
  Notice,
  QueryState,
  ScreenList,
  Sheet,
  Stack,
} from "@/ui/primitives";
import type { SessionScope } from "./session-types";
import {
  readDesktopPreferences,
  readDesktopPreferenceStatus,
  readComputerTemplate,
  type DesktopPreferencesSnapshot,
  type DesktopPreferenceStatus,
  type PreferenceDefaults,
} from "./desktop-preferences-model";
import { DesktopPreferenceEditorSheet, type PreferenceEditor as Editor } from "./desktop-preferences-editor";
import { DesktopPreferenceContext } from "./desktop-preference-context";
import { FeatureUnavailable } from "./unavailable-state";
type Props = {
  scope: SessionScope;
  projectId: string;
  onClose: () => void;
  onInsert?: (body: string) => void;
  embedded?: boolean;
};
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
  const store = useMemo(
    () =>
      reviewedOperationStore(
        AsyncStorage,
        `bycoda.mobile.desktop-preference-operation.v1:${JSON.stringify([opening.machineId, opening.environmentId, opening.projectId, opening.sessionId])}`,
      ),
    [opening],
  );
  const {
    loading,
    loaded: attempt,
    setLoaded: setAttempt,
    error,
    setError,
    busy,
    pendingAction,
    run,
  } = useReviewedOperation({ source: store, load: () => store.load(), canRun: () => supported });
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
  const closeEditor = () => { if (!busy) setEditor(null); };
  const [receipt, setReceipt] = useState<DesktopPreferenceStatus>();
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
  const header = (
    <Stack>
      <DesktopPreferenceContext computerName={opening.machineName?.trim() || opening.machineId} snapshot={snapshot} />
      {!embedded ? (
        <Body muted>
          {copy(
            "Bilgisayar ayarları yalnızca gelecekteki konuşmalara uygulanır. Şablon eklemek mesaj göndermez.",
            "Computer defaults apply to future conversations. Inserting a template does not send a message.",
          )}
        </Body>
      ) : null}
      {!supported ? (
        <FeatureUnavailable message={copy(
          "Açık konuşması olan bağlı ve desteklenen bir bilgisayar seçin.",
          "Choose a paired, supported computer with this conversation open.",
        )} />
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
          dismissible={!busy}
          onClose={onClose}
        >
          {content}
        </Sheet>
      )}
      <DesktopPreferenceEditorSheet
        computerName={opening.machineName?.trim() || opening.machineId}
        editor={editor}
        snapshot={snapshot}
        form={{
          name,
          setName,
          body,
          setBody,
          trigger,
          setTrigger,
          modelId,
          setModelId,
          defaults,
          setDefaults,
          dirty,
        }}
        disabled={disabled}
        busy={busy}
        pendingAction={pendingAction}
        error={error}
        onApply={apply}
        onSwitchScope={openProvider}
        onInsert={onInsert}
        isCurrent={current}
        onClose={onClose}
        onCloseEditor={closeEditor}
      />
    </>
  );
}
