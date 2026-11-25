import type { SessionSettingsProps, SessionSettingsDraft } from "./session-settings-types";
import { View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useFormDraft } from "@/state/form-draft";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation } from "@/state/queries";
import {
  Button,
  FormActions,
  Field,
  MutationState,
  NavigationGroup,
  NavigationRow,
  Notice,
  ErrorText,
  Row,
  Section,
  Sheet,
} from "@/ui/primitives";
import { useLocalDraft } from "./use-local-draft";
import { decodeSessionSettingsDraft, encodeSessionSettingsDraft } from "./session-settings-draft";
import { useCopy } from "@/ui/copy";
import { useSheetGuard } from "@/ui/sheet-guard";
import type { HostSession } from "./wire";
import { captureSessionAuthority } from "@/domain/session-authority";
import { useMobileTheme } from "@/ui/theme";
import { sessionTitleUpdate } from "./session-title-update";
import { activeSessionModel } from "./catalog";

/** Equal-width pair aligned to the field edges; wraps to full-width rows at large text. */
const ACTION_BUTTON = { flexGrow: 1, flexBasis: 140, alignSelf: "stretch" } as const;

/**
 * Session settings: title, pin and archive. Agent, model, effort, access and compaction have one
 * editor, the composer's "Model and access" sheet; this sheet links to it instead of editing a
 * second copy with its own draft.
 */
export function SessionSettings({
  onClose,
  value,
  projectId,
  disabled,
  onUpdated,
  onOpenModel,
}: SessionSettingsProps) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const [initialDraft] = useState<SessionSettingsDraft>(() => ({
    title: value.session.title,
    provider: value.session.harness,
    accountId: value.session.providerAccountId,
    model: value.session.model,
    mode: value.session.runtimeMode,
    modelSettings: value.session.modelSettings,
  }));
  const form = useFormDraft(initialDraft);
  const [openingMachine] = useState(() => ({
    id: machine?.id,
    environmentId: machine?.environmentId,
  }));
  const targetChanged =
    openingMachine.id !== machine?.id || openingMachine.environmentId !== machine?.environmentId;
  // The storage key and draft shape are unchanged, so earlier phone drafts keep their title.
  const [draftKey] = useState(
    () =>
      `bycoda.mobile.session-settings.v1:${JSON.stringify([machine?.id, machine?.environmentId, projectId, value.session.id])}`,
  );
  const localDraft = useLocalDraft(
    draftKey,
    decodeSessionSettingsDraft,
    encodeSessionSettingsDraft,
  );
  const [hydrated, setHydrated] = useState(false);
  const savedBaseline = useRef(initialDraft);
  const latestValues = useRef(form.values);
  latestValues.current = form.values;
  const { title } = form.values;
  const saving = useRef(false);
  const [savingPending, setSavingPending] = useState(false);
  const [reviewed, setReviewed] = useState(value);
  const update = useHostMutation<HostSession>("sessions.update", ["sessions", projectId]);
  const pending =
    disabled || targetChanged || !hydrated || !localDraft.ready || savingPending || update.isPending;
  const uncertain = !!(update.error as { uncertain?: boolean } | null)?.uncertain;
  const [savedTitle, setSavedTitle] = useState(value.session.title);
  const titleFlight = useRef<{ text: string; promise: Promise<boolean> } | null>(null);

  // Restore the scoped phone draft before enabling edits or Host writes. Only the title is
  // edited here; agent values from older drafts stay at their baseline.
  useEffect(() => {
    if (!localDraft.ready || hydrated) return;
    const stored = localDraft.value;
    if (stored) {
      savedBaseline.current = stored.baseline;
      form.reset(stored.baseline);
      form.patch({ title: stored.values.title });
      setSavedTitle(stored.baseline.title);
      setReviewed({
        ...value,
        authorityGeneration: stored.authorityGeneration,
        revision: stored.revision ?? value.revision,
        session: { ...value.session, title: stored.baseline.title },
      });
    }
    setHydrated(true);
  }, [localDraft.ready, hydrated]);
  const patchForm = (patch: Pick<SessionSettingsDraft, "title">) => {
    if (pending) return;
    const values = { ...latestValues.current, ...patch };
    latestValues.current = values;
    form.patch(patch);
    localDraft.setValue({
      baseline: savedBaseline.current,
      values,
      authorityGeneration: reviewed.authorityGeneration,
      revision: reviewed.revision,
    });
  };
  const acknowledge = (patch: Pick<SessionSettingsDraft, "title">) => {
    savedBaseline.current = { ...savedBaseline.current, ...patch };
    localDraft.setValue({
      baseline: savedBaseline.current,
      values: latestValues.current,
      authorityGeneration: reviewed.authorityGeneration,
      revision: reviewed.revision,
    });
  };
  const clearAndClose = async () => {
    try {
      localDraft.setValue(null);
      await localDraft.persist();
      onClose();
    } catch {
      /* Storage error remains visible and editor stays open. */
    }
  };
  const titleDirty = title.trim() !== savedTitle;
  const conflict =
    value.authorityGeneration !== reviewed.authorityGeneration ||
    (value.session.title !== reviewed.session.title && value.session.title !== savedBaseline.current.title);
  const { requestClose: discardChanges } = useSheetGuard({
    dirty: titleDirty,
    pending,
    onClose: () => {
      void clearAndClose();
    },
  });

  const saveTitle = async () => {
    if (!title.trim()) return false;
    if (!titleDirty) return true;
    const submitted = title.trim();
    if (titleFlight.current)
      return titleFlight.current.text === submitted ? titleFlight.current.promise : false;
    if (disabled || update.isPending) return false;
    const promise = (async () => {
      try {
        await update.mutateAsync(sessionTitleUpdate(projectId, value.session.id, submitted, reviewed));
        setSavedTitle(submitted);
        acknowledge({ title: submitted });
        onUpdated();
        return true;
      } catch {
        /* The mutation state shows the failure. */
        return false;
      }
    })();
    titleFlight.current = { text: submitted, promise };
    try {
      return await promise;
    } finally {
      if (titleFlight.current?.promise === promise) titleFlight.current = null;
    }
  };
  const save = async () => {
    if (saving.current || pending || uncertain || conflict || !title.trim()) return;
    saving.current = true;
    setSavingPending(true);
    const submitted = latestValues.current.title;
    try {
      await localDraft.persist();
      if (!(await saveTitle())) return;
      if (latestValues.current.title === submitted) await clearAndClose();
    } catch {
      /* Draft storage errors stay visible; no implicit retry. */
    } finally {
      saving.current = false;
      setSavingPending(false);
    }
  };
  const modelName = activeSessionModel(value.session).name;

  return (
    <Sheet
      visible
      onClose={() => {
        if (!hydrated) onClose();
        else void clearAndClose();
      }}
      title={copy("Oturum ayarları", "Session settings")}
      size="form"
      dismissible={!pending || (!hydrated && !!localDraft.error)}
      dirty={titleDirty}
      footer={
        <FormActions
          submitLabel={copy("Kaydet", "Save")}
          onSubmit={() => {
            void save();
          }}
          busy={savingPending || update.isPending}
          dirty={titleDirty}
          disabled={pending || uncertain || conflict || !titleDirty || !title.trim()}
        />
      }
    >
      {localDraft.error ? (
        <>
          <ErrorText error={localDraft.error} />
          {!hydrated ? (
            <Button
              label={copy("Yeniden dene", "Retry")}
              onPress={() => {
                void localDraft.load();
              }}
            />
          ) : null}
        </>
      ) : null}
      {uncertain ? (
        <Notice
          tone="warning"
          message={copy(
            "Sonuç belirsiz. Yeniden göndermeden önce bilgisayardaki oturumu kontrol edin.",
            "The result is uncertain. Check the session on the computer before sending again.",
          )}
        />
      ) : null}
      {conflict ? (
        <Notice
          tone="warning"
          message={copy(
            "Oturum değişti. Ayarları kapatıp yeniden inceleyin.",
            "Session changed. Close settings and review again.",
          )}
        />
      ) : null}
      <Section title={copy("Oturum", "Session")}>
        <View style={uiStyles.stack}>
          <Field
            label={copy("Başlık", "Title")}
            value={title}
            error={
              !title.trim() ? copy("Bu alan gereklidir.", "This field is required.") : undefined
            }
            editable={!pending}
            onChangeText={(text) => patchForm({ title: text })}
            returnKeyType="done"
          />
          <MutationState mutation={update} success={copy("Kaydedildi.", "Saved.")} />
          <Row>
            <Button
              label={value.pinned ? copy("Sabitlemeyi kaldır", "Unpin") : copy("Sabitle", "Pin")}
              tone="secondary"
              style={ACTION_BUTTON}
              disabled={pending}
              busy={update.isPending && update.variables?.pinned !== undefined}
              onPress={() => {
                void update
                  .mutateAsync({
                    projectId,
                    sessionId: value.session.id,
                    pinned: !value.pinned,
                    ...captureSessionAuthority(value),
                  })
                  .then(onUpdated)
                  .catch(() => {});
              }}
            />
            <Button
              label={
                value.archived ? copy("Arşivden çıkar", "Unarchive") : copy("Arşivle", "Archive")
              }
              tone="secondary"
              style={ACTION_BUTTON}
              disabled={pending}
              busy={update.isPending && update.variables?.archived !== undefined}
              onPress={() => {
                void update
                  .mutateAsync({
                    projectId,
                    sessionId: value.session.id,
                    ...captureSessionAuthority(value),
                    archived: !value.archived,
                  })
                  .then(onUpdated)
                  .catch(() => {});
              }}
            />
          </Row>
        </View>
      </Section>
      {onOpenModel ? (
        <NavigationGroup>
          <NavigationRow
            label={copy("Model ve erişim", "Model and access")}
            detail={titleDirty
              ? copy("Önce başlığı kaydet veya bırak.", "Save or discard the title first.")
              : modelName}
            disabled={disabled || pending || titleDirty}
            onPress={() => {
              void clearAndClose().then(onOpenModel);
            }}
          />
        </NavigationGroup>
      ) : null}
      {titleDirty && (update.isError || !title.trim() || conflict) ? (
        <Button
          label={copy("Değişiklikleri bırak", "Discard changes")}
          tone="quiet"
          disabled={pending}
          onPress={discardChanges}
        />
      ) : null}
    </Sheet>
  );
}
