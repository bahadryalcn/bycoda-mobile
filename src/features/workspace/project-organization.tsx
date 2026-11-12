import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { useEffect, useMemo, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { reviewedOperationStore } from "@/state/reviewed-operation-store";
import { useReviewedOperation } from "@/state/use-reviewed-operation";
import { useFormDraft } from "@/state/form-draft";
import { useCopy } from "@/ui/copy";
import {
  Body,
  Button,
  ErrorText,
  NavigationGroup,
  NavigationRow,
  Notice,
  QueryState,
  Row,
  ScreenList,
  Sheet,
  Stack,
} from "@/ui/primitives";
import type { SessionScope } from "./session-types";
import {
  readOrganization,
  readOrganizationStatus,
  validateOrganizationChange,
  type OrganizationSnapshot,
  type OrganizationStatus,
} from "./project-organization-model";
import {
  OrganizationEditorSheet,
  emptyOrganizationForm as empty,
  type OrganizationEditor as Editor,
} from "./project-organization-editor";
import { FeatureUnavailable } from "./unavailable-state";

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
  const {
    loading,
    loaded: attempt,
    setLoaded: setAttempt,
    error,
    setError,
    busy,
    pendingAction,
    run,
  } = useReviewedOperation({ source: store, load: () => store.load(), canRun: () => !!supported });
  const [receipt, setReceipt] = useState<OrganizationStatus>();
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
                <FeatureUnavailable message={copy(
                  "Organizasyonu yönetmek için güncel bycoda masaüstü uygulamasını bu projede açık tutun.",
                  "Keep the updated bycoda desktop app open in this project to manage organization.",
                )} />
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
                        copy("Diğerleri", "Others")
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
      <OrganizationEditorSheet
        editor={editor}
        snapshot={visible}
        form={form}
        disabled={!!disabled}
        busy={busy}
        pendingAction={pendingAction}
        error={error}
        onOpen={open}
        onApply={apply}
        onClose={() => setEditor(null)}
      />
    </>
  );
}
