import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { reviewedOperationStore } from "@/state/reviewed-operation-store";
import { useFormDraft } from "@/state/form-draft";
import { useCopy } from "@/ui/copy";
import {
  Body,
  Button,
  ErrorText,
  Field,
  FormActions,
  MultiSelectField,
  NavigationGroup,
  NavigationRow,
  Notice,
  QueryState,
  Row,
  ScreenList,
  SelectField,
  Sheet,
  Stack,
} from "@/ui/primitives";
import { space } from "@/ui/tokens";
import type { SessionScope } from "./session-types";
import {
  moveOrganizationId,
  readOrganization,
  readOrganizationStatus,
  validateOrganizationChange,
  type OrganizationSnapshot,
  type OrganizationStatus,
} from "./project-organization-model";
type Editor = { kind: string; folderId?: string };
export function OrganizationOrderRow({ label, index, total, disabled, onMove }: { label: string; index: number; total: number; disabled: boolean; onMove: (step: number) => void }) {
 const copy = useCopy();
 return <View style={{ gap: space.xs }}><Body>{label}</Body><Row><Button tone="quiet" label={copy("Yukarı taşı", "Move up")} disabled={disabled || index === 0} onPress={() => onMove(-1)} /><Button tone="quiet" label={copy("Aşağı taşı", "Move down")} disabled={disabled || index === total - 1} onPress={() => onMove(1)} /></Row></View>;
}
const empty = () => ({
  name: "",
  groupId: "",
  sessionId: "",
  folderId: "",
  parentId: "",
  target: "root",
  list: "loose",
  ids: [] as string[],
});

export function ProjectOrganization({
  scope,
  projectId,
  onClose,
}: {
  scope: SessionScope;
  projectId: string;
  onClose: () => void;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [opening] = useState(() => ({
    ...scope,
    projectId,
    environmentId: machine?.environmentId,
    machineName: machine?.name,
  }));
  const current = () => {
    const state = useMachines.getState();
    return (
      state.activeId === opening.machineId &&
      state.machines.find((row) => row.id === opening.machineId)?.environmentId ===
        opening.environmentId &&
      machine?.id === opening.machineId &&
      scope.sessionId === opening.sessionId &&
      projectId === opening.projectId
    );
  };
  const supported =
    current() &&
    !!opening.environmentId &&
    machine?.capabilities?.includes("projects.organization.desktop.v1");
  const [snapshot, setSnapshot] = useState<OrganizationSnapshot | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState("primary");
  const occupied = useRef(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const form = useFormDraft(empty);
  const store = useMemo(
    () =>
      reviewedOperationStore(
        AsyncStorage,
        `bycoda.mobile.organization-operation.v1:${JSON.stringify([opening.machineId, opening.projectId, opening.sessionId])}`,
      ),
    [opening],
  );
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState<Awaited<ReturnType<typeof store.load>>>(null);
  const [receipt, setReceipt] = useState<OrganizationStatus>();
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
  const query = useHostQuery<OrganizationSnapshot>(
    ["project-organization", opening.projectId, opening.sessionId],
    "projects.organization.read",
    { projectId: opening.projectId, sessionId: opening.sessionId },
    {
      enabled: !!supported,
      interval: 10000,
      queryFn: async (client, signal) =>
        readOrganization(
          await client.request(
            "projects.organization.read",
            { projectId: opening.projectId, sessionId: opening.sessionId },
            { signal },
          ),
          opening.environmentId!,
          opening.sessionId,
        ),
    },
  );
  const statusQuery = useHostQuery<OrganizationStatus>(
    ["project-organization-status", opening.sessionId, attempt?.operationId],
    "projects.organization.status",
    {
      projectId: opening.projectId,
      sessionId: opening.sessionId,
      operationId: attempt?.operationId,
    },
    {
      enabled: !!supported && !!attempt && attempt.environmentId === opening.environmentId,
      queryFn: async (client, signal) =>
        readOrganizationStatus(
          await client.request(
            "projects.organization.status",
            {
              projectId: opening.projectId,
              sessionId: opening.sessionId,
              operationId: attempt?.operationId,
            },
            { signal },
          ),
          opening.environmentId!,
          opening.sessionId,
        ),
    },
  );
  const mutation = useHostMutation("projects.organization.patch", ["projects", opening.projectId]);
  useEffect(() => {
    if (query.data && !query.error && (!snapshot || (!editor && !attempt && !busy)))
      setSnapshot(query.data);
  }, [query.data, query.error, snapshot, editor, attempt, busy]);
  const allowedGroups = new Set((query.data ?? snapshot)?.groups.map((row) => row.id) ?? []);
  const visible =
    supported && !query.isError && snapshot
      ? { ...snapshot, groups: snapshot.groups.filter((row) => allowedGroups.has(row.id)) }
      : null;
  const status = supported ? (receipt ?? statusQuery.data) : undefined;
  const disabled = !visible || loading || busy || !!attempt;
  const run = async (action: () => Promise<unknown>, actionKey = "primary") => {
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
  const open = (value: Editor) => {
    if (disabled || !visible) return;
    const folder = visible.folders.find((row) => row.id === value.folderId);
    const defaults = empty();
    defaults.name =
      value.kind === "projectName"
        ? visible.customName
        : value.kind === "groupName"
          ? (visible.groups.find((row) => row.id === visible.groupId)?.name ?? "")
          : (folder?.name ?? "");
    defaults.groupId = visible.groupId ?? "";
    defaults.folderId = folder?.id ?? "";
    defaults.ids =
      value.kind === "folderSessions"
        ? (folder?.sessionIds ?? [])
        : value.kind === "folderOrder"
          ? visible.folders.map((row) => row.id)
          : value.kind === "sessionOrder"
            ? [
                ...new Set([
                  ...(visible.order.loose ?? []),
                  ...visible.sessions.map((row) => row.id),
                ]),
              ]
            : [];
    form.reset(defaults);
    setEditor(value);
  };
  const apply = (change: Record<string, unknown>) => {
    if (disabled || !visible) return;
    const reviewed = visible;
    try {
      validateOrganizationChange(reviewed, change);
    } catch (cause) {
      setError(cause);
      return;
    }
    void run(async () => {
      if (!current()) return;
      setReceipt(undefined);
      const claimed = await store.claim({
        operationId: randomUUID(),
        environmentId: opening.environmentId!,
        digest: reviewed.revision,
      });
      setAttempt(claimed.attempt);
      if (!claimed.claimed) return;
      if (!current()) {
        await store.clear(claimed.attempt.operationId);
        setAttempt(null);
        return;
      }
      const result = readOrganizationStatus(
        await mutation.mutateAsync({
          projectId: opening.projectId,
          sessionId: opening.sessionId,
          expectedRevision: reviewed.revision,
          operationId: claimed.attempt.operationId,
          change,
        }),
        opening.environmentId!,
        opening.sessionId,
      );
      setReceipt(result);
      if (result.snapshot) setSnapshot(result.snapshot);
      if (result.state === "applied") {
        form.markSaved(form.values);
        setEditor(null);
        const refreshed = await query.refetch();
        if (refreshed.data && !refreshed.error) setSnapshot(refreshed.data);
        await store.clear(claimed.attempt.operationId);
        setAttempt(null);
      }
    });
  };
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
    <>
      <Sheet
        visible
        size="full"
        scroll={false}
        title={copy("Proje organizasyonu", "Project organization")}
        onClose={onClose}
        dismissible={!busy}
      >
        <ScreenList
          data={visible?.folders ?? []}
          keyExtractor={(row) => row.id}
          header={
            <Stack>
              <Body>{opening.machineName ?? opening.machineId}</Body>
              {visible ? <Body mono>{visible.projectCwd}</Body> : null}
              <Notice
                message={copy(
                  "Bu ayarlar bycoda’daki görünen adları ve konuşma klasörlerini düzenler. Diskteki dosyalar taşınmaz veya yeniden adlandırılmaz.",
                  "These settings organize display names and conversation folders in bycoda. Files on disk are not moved or renamed.",
                )}
              />
              {!supported ? (
                <Notice
                  message={copy(
                    "Organizasyonu yönetmek için güncel bycoda masaüstü uygulamasını bu projede açık tutun.",
                    "Keep the updated bycoda desktop app open in this project to manage organization.",
                  )}
                />
              ) : (
                <QueryState query={query} />
              )}
              <ErrorText error={error} />
              {attempt ? (
                <>
                  <QueryState query={statusQuery} />
                  <Notice
                    tone={status?.state === "applied" ? "success" : "warning"}
                    message={
                      status?.state === "applied"
                        ? copy("Organizasyon değişikliği kaydedildi.", "Organization change saved.")
                        : status?.state === "failed"
                          ? copy(
                              "Değişiklik doğrulanamadı. Yeni işlemden önce masaüstündeki güncel durumu inceleyin.",
                              "The change could not be verified. Review the current desktop state before another action.",
                            )
                          : copy(
                              "İşlem sonucu bilinmiyor. Durum sorgusu değişikliği tekrar göndermez.",
                              "The operation outcome is unknown. Checking status does not resend the change.",
                            )
                    }
                  />
                  <Button busy={busy && pendingAction === "secondary-1"}
                    tone="quiet"
                    label={copy("İşlem durumunu kontrol et", "Check operation status")}
                    disabled={!supported || busy || statusQuery.isFetching}
                    onPress={() => {
                      void run(async () => {
                        const result = await statusQuery.refetch();
                        if (result.error) throw result.error;
                        if (result.data) {
                          setReceipt(result.data);
                          if (result.data.snapshot) setSnapshot(result.data.snapshot);
                        }
                      }, "secondary-1");
                    }}
                  />
                  {status?.state === "applied" || status?.state === "failed" ? (
                    <Button busy={busy && pendingAction === "secondary-2"}
                      tone="quiet"
                      label={copy(
                        "Güncel durumu inceleyip devam et",
                        "Review current state and continue",
                      )}
                      disabled={!supported || busy}
                      onPress={() => {
                        void run(async () => {
                          const result = await query.refetch();
                          if (result.error) throw result.error;
                          if (!result.data) return;
                          await store.clear(attempt.operationId);
                          setAttempt(null);
                          setReceipt(undefined);
                          setSnapshot(result.data);
                          setEditor(null);
                          form.reset(empty());
                        }, "secondary-2");
                      }}
                    />
                  ) : null}
                </>
              ) : null}
              {visible ? (
                <>
                  <NavigationGroup>
                    <NavigationRow
                      label={copy("Proje görünen adı", "Project display name")}
                      detail={visible.name}
                      disabled={disabled}
                      onPress={() => open({ kind: "projectName" })}
                    />
                    <NavigationRow
                      label={copy("Proje grubu", "Project group")}
                      detail={
                        visible.groups.find((row) => row.id === visible.groupId)?.name ??
                        copy("Gruplanmamış", "Ungrouped")
                      }
                      disabled={disabled}
                      onPress={() => open({ kind: "projectGroup" })}
                    />
                    {visible.groupId ? (
                      <NavigationRow
                        label={copy("Grup adı", "Group name")}
                        detail={visible.groups.find((row) => row.id === visible.groupId)?.name}
                        disabled={disabled}
                        onPress={() => open({ kind: "groupName" })}
                      />
                    ) : null}
                    <NavigationRow
                      label={copy("Konuşmayı klasöre taşı", "Move conversation to folder")}
                      disabled={disabled}
                      onPress={() => open({ kind: "sessionMove" })}
                    />
                    <NavigationRow
                      label={copy("Konuşmaları sırala", "Order conversations")}
                      disabled={disabled}
                      onPress={() => open({ kind: "sessionOrder" })}
                    />
                    <NavigationRow
                      label={copy("Klasörleri sırala", "Order folders")}
                      disabled={disabled || !visible.folders.length}
                      onPress={() => open({ kind: "folderOrder" })}
                    />
                    <NavigationRow
                      label={copy("Konuşma klasörü oluştur", "Create conversation folder")}
                      disabled={disabled || !visible.sessions.length}
                      onPress={() => open({ kind: "folderCreate" })}
                    />
                  </NavigationGroup>
                  <Row>
                    <Button
                      tone="quiet"
                      label={copy("Projeyi yukarı taşı", "Move project up")}
                      disabled={disabled || visible.projectPosition <= 0}
                      onPress={() => apply({ kind: "projectMove", step: "up" })}
                    />
                    <Button
                      tone="quiet"
                      label={copy("Projeyi aşağı taşı", "Move project down")}
                      disabled={disabled || visible.projectPosition >= visible.projectCount - 1}
                      onPress={() => apply({ kind: "projectMove", step: "down" })}
                    />
                  </Row>
                  {visible.groupId ? (
                    <Row>
                      <Button
                        tone="quiet"
                        label={copy("Grubu yukarı taşı", "Move group up")}
                        disabled={disabled || visible.groups[0]?.id === visible.groupId}
                        onPress={() => apply({ kind: "groupMove", step: "up" })}
                      />
                      <Button
                        tone="quiet"
                        label={copy("Grubu aşağı taşı", "Move group down")}
                        disabled={disabled || visible.groups.at(-1)?.id === visible.groupId}
                        onPress={() => apply({ kind: "groupMove", step: "down" })}
                      />
                    </Row>
                  ) : null}
                </>
              ) : null}
              <Button busy={busy && pendingAction === "secondary-3"}
                tone="quiet"
                label={copy("Organizasyonu yenile", "Refresh organization")}
                disabled={!supported || busy || !!attempt || !!editor || query.isFetching}
                onPress={() => {
                  void run(async () => {
                    const result = await query.refetch();
                    if (result.error) throw result.error;
                    if (result.data) setSnapshot(result.data);
                  }, "secondary-3");
                }}
              />
            </Stack>
          }
          renderItem={({ item }) => (
            <NavigationRow
              label={item.name}
              detail={copy("{p0} konuşma", "{p0} conversations", { p0: item.sessionIds.length })}
              disabled={disabled}
              onPress={() => open({ kind: "folder", folderId: item.id })}
            />
          )}
        />
      </Sheet>
      <Sheet
        visible={!!editor && !!visible}
        size={ordering ? "full" : "form"}
        scroll={!ordering}
        title={editTitle}
        dirty={form.dirty}
        dismissible={!busy}
        onClose={() => setEditor(null)}
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
                      { value: "loose", label: copy("Gruplanmamış", "Ungrouped") },
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
                  { value: "", label: copy("Gruplanmamış", "Ungrouped") },
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
                    { value: "", label: copy("Gruplanmamış", "Ungrouped") },
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
    </>
  );
}
