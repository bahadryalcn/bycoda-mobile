import type { FileEditorProps, FileEditorMode, FileEditorConfirmation } from "./file-editor-types";
import { useCallback, useEffect, useState } from "react";
import { BackHandler } from "react-native";
import { useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine } from "@/state/machines";
import { useHostClient, useHostMutation, useHostQuery } from "@/state/queries";
import {
  Badge,
  Body,
  Button,
  ConfirmationCard,
  IconButton,
  Input,
  MutationState,
  Notice,
  QueryState,
  Row,
  Screen,
  SegmentedControl,
  Sheet,
} from "@/ui/primitives";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import { useMobileTheme } from "@/ui/theme";
import { haptic } from "@/ui/motion";
import { colors, radii, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { View } from "react-native";
import { DocumentPreview, ProjectMedia } from "@/ui/document-preview";
import { isFileConflict, isMediaFile } from "./file-preview-model";
import { useCopy } from "@/ui/copy";
import { parseFileDraft, type FileDraft } from "./draft-store";
import { registerWorkspaceDraft } from "./draft-guard";
import { useLocalDraft } from "./use-local-draft";
import { ErrorText, useProjectRefresh } from "./shared";

export type { DraftGuard } from "./file-editor-types";

const encodeFileDraft = (value: FileDraft | null) =>
  value && value.content !== value.expected ? JSON.stringify(value) : null;

export function FileEditor({ projectId, cwd, root, path, onBack, onDraftGuard }: FileEditorProps) {
  useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const client = useHostClient();
  const media = isMediaFile(path);
  const context =
    client && machine && (cwd || root)
      ? { client, machineId: machine.id, projectId, cwd: cwd || root! }
      : undefined;
  const file = useHostQuery<string>(
    ["file", projectId, cwd, path],
    "files.read",
    {
      projectId,
      cwd,
      path,
    },
    { enabled: !media },
  );
  const binary = media || file.data?.includes("\0") === true;
  const save = useHostMutation<null>("files.write", ["files", projectId]);
  const refreshProject = useProjectRefresh(projectId);
  const draftKey = `bycoda.mobile.file-draft.v1:${JSON.stringify([machine?.id, projectId, cwd, path])}`;
  const draft = useLocalDraft(draftKey, parseFileDraft, encodeFileDraft);
  const edit =
    draft.value ?? (file.data !== undefined ? { expected: file.data, content: file.data } : null);
  const dirty = !!edit && edit.expected !== edit.content;
  const [mode, setMode] = useState<FileEditorMode>("default");
  const editing = mode === "edit" || (mode === "default" && !!draft.value && dirty);
  const [confirmation, setConfirmation] = useState<FileEditorConfirmation>(null);
  const transition = useAsyncAction<void>();
  const navigation = useNavigation();
  const persist = draft.persist;
  useEffect(() => {
    onDraftGuard?.(
      save.isPending
        ? async () => {
            throw new Error(
              copy(
                "Dosya kaydediliyor. İşlem bitince yeniden dene.",
                "The file is being saved. Try again when it finishes.",
              ),
            );
          }
        : dirty
          ? () => persist()
          : null,
    );
    return () => onDraftGuard?.(null);
  }, [dirty, persist, onDraftGuard, save.isPending, copy]);
  useEffect(
    () => (dirty ? registerWorkspaceDraft(draftKey, () => persist()) : undefined),
    [dirty, draftKey, persist],
  );
  usePreventRemove(true, ({ data }) => {
    if (save.isPending || transition.isPending) return;
    const localBack = data.action.type === "GO_BACK" || data.action.type === "POP";
    if (dirty) setConfirmation({ kind: "leave", ...(localBack ? {} : { action: data.action }) });
    else if (localBack) onBack();
    else navigation.dispatch(data.action);
  });
  useFocusEffect(
    useCallback(() => {
      if (confirmation) return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!save.isPending && !transition.isPending) {
          if (dirty) setConfirmation({ kind: "leave" });
          else onBack();
        }
        return true;
      });
      return () => subscription.remove();
    }, [confirmation, dirty, onBack, save.isPending, transition.isPending]),
  );
  const leaveEditor = useCallback(() => {
    if (confirmation?.kind === "leave" && confirmation.action)
      navigation.dispatch(confirmation.action);
    else onBack();
  }, [confirmation, navigation, onBack]);
  return (
    <Screen>
      <Row style={{ flexWrap: "nowrap" }}>
        <IconButton
          label={copy("Dosyalara dön", "Back to files")}
          disabled={transition.isPending || save.isPending}
          onPress={() => (dirty ? setConfirmation({ kind: "leave" }) : onBack())}
        >
          <ChevronLeft size={22} strokeWidth={2.2} color={colors.accent} />
        </IconButton>
        <Body
          mono
          numberOfLines={1}
          ellipsizeMode="middle"
          style={[uiStyles.grow, { fontWeight: "600" }]}
        >
          {path}
        </Body>
        {!binary && edit && draft.ready ? (
          <Badge
            label={dirty ? copy("Kaydedilmedi", "Unsaved") : copy("Kaydedildi", "Saved")}
            tone={dirty ? "warning" : undefined}
          />
        ) : null}
      </Row>
      {confirmation?.kind === "leave" ? (
        <Sheet
          visible
          size="compact"
          title={path}
          dismissible={!transition.isPending}
          onClose={() => setConfirmation(null)}
        >
          <ConfirmationCard
            message={copy(
              "Kaydedilmemiş değişikliklerin var. Taslak telefonda korunur.",
              "You have unsaved changes. Your draft stays on this phone.",
            )}
            cancelLabel={copy("Düzenlemeye devam", "Keep editing")}
            onCancel={() => setConfirmation(null)}
            confirmLabel={copy("Taslağı koruyarak dön", "Back, keep draft")}
            tone="default"
            busy={transition.isPending}
            onConfirm={() => {
              void transition.run(async () => {
                await persist();
                leaveEditor();
              });
            }}
            additionalActions={
              <Button
                label={copy("Değişiklikleri bırak", "Discard edits")}
                tone="danger"
                disabled={transition.isPending || save.isPending}
                onPress={() => {
                  void transition.run(async () => {
                    await persist(null);
                    draft.setValue(null);
                    leaveEditor();
                  });
                }}
              />
            }
          />
        </Sheet>
      ) : null}
      {!media ? <QueryState query={file} loading="content" /> : null}
      {binary ? (
        context ? (
          <ProjectMedia path={path} context={context} />
        ) : (
          <Notice
            tone="warning"
            message={copy(
              "Dosyayı görüntülemek için bilgisayara bağlan.",
              "Connect to the computer to preview this file.",
            )}
          />
        )
      ) : null}
      {!draft.ready && !draft.error ? (
        <QueryState query={{ isPending: true }} loading="inline" />
      ) : null}
      <ErrorText error={draft.error} />
      <MutationState mutation={transition} />
      {draft.error ? (
        <Button
          label={
            draft.ready
              ? copy("Taslağı kaydetmeyi yeniden dene", "Retry saving draft")
              : copy("Dosya taslağını yeniden yükle", "Retry loading file draft")
          }
          onPress={() => {
            if (draft.ready) void persist().catch(() => {});
            else void draft.load();
          }}
        />
      ) : null}
      {!binary && edit && draft.ready ? (
        <>
          <Row style={{ flexWrap: "nowrap" }}>
            <View style={uiStyles.grow}>
              <SegmentedControl
                label={copy("Düzenle veya önizle", "Edit or preview")}
                value={editing ? "edit" : "preview"}
                disabled={transition.isPending}
                options={[
                  { value: "edit", label: copy("Düzenle", "Edit") },
                  { value: "preview", label: copy("Önizle", "Preview") },
                ]}
                onChange={(value) => setMode(value)}
              />
            </View>
            <Button
              label={copy("Kaydet", "Save")}
              tone="primary"
              density="compact"
              disabled={!dirty || transition.isPending}
              busy={save.isPending}
              onPress={() => {
                const submitted = edit;
                void save
                  .mutateAsync({
                    projectId,
                    cwd,
                    path,
                    expected: submitted.expected,
                    content: submitted.content,
                  })
                  .then(() => {
                    draft.setValue((current) => ({
                      expected: submitted.content,
                      content: current?.content ?? submitted.content,
                    }));
                    haptic.success();
                    void refreshProject();
                  })
                  .catch(() => {});
              }}
            />
          </Row>
          <MutationState
            mutation={save}
            success={copy("Dosya bilgisayara kaydedildi.", "File saved on your computer.")}
          />
          {isFileConflict(save.error) ? (
            <>
              <Notice
                tone="warning"
                message={copy(
                  "Bilgisayarda dosya değişmiş olabilir. Yazdıkların burada korunur; bilgisayardaki sürümü yüklemek değişikliklerini bırakır.",
                  "The file may have changed on your computer. Your edits remain here; loading the computer version discards them.",
                )}
              />
              <Button
                label={copy("Bilgisayardaki sürümü yükle", "Load computer version")}
                disabled={transition.isPending}
                onPress={() => setConfirmation({ kind: "reload" })}
              />
            </>
          ) : null}
          {confirmation?.kind === "reload" ? (
            <Sheet
              visible
              size="compact"
              title={copy("Dosyayı yeniden yükle", "Reload file")}
              dismissible={!transition.isPending}
              onClose={() => setConfirmation(null)}
            >
              <ConfirmationCard
                message={copy(
                  "Yerel düzenlemeleri bırakıp güncel dosyayı yükle?",
                  "Discard these edits and load the current file?",
                )}
                cancelLabel={copy("Vazgeç", "Cancel")}
                onCancel={() => setConfirmation(null)}
                confirmLabel={copy("Dosyayı yeniden yükle", "Reload file")}
                busy={transition.isPending}
                onConfirm={() => {
                  void transition.run(async () => {
                    const result = await file.refetch();
                    if (result.error) throw result.error;
                    if (result.data === undefined)
                      throw new Error(
                        copy("Dosya içeriği yüklenemedi.", "File contents could not be loaded."),
                      );
                    await persist(null);
                    draft.setValue({ expected: result.data, content: result.data });
                    save.reset();
                    setConfirmation(null);
                  });
                }}
              />
            </Sheet>
          ) : null}
          {editing ? (
            <View style={{ backgroundColor: colors.panel, borderRadius: radii.card, padding: space.sm }}>
            <Input
              label={copy("Dosya içeriği", "File content")}
              mono
              value={edit.content}
              multiline
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
              editable={!transition.isPending}
              onChangeText={(content) =>
                draft.setValue((current) => ({ ...(current ?? edit), content }))
              }
              textAlignVertical="top"
              style={{ minHeight: 340 }}
            />
            </View>
          ) : (
            <DocumentPreview name={path} text={edit.content} context={context} />
          )}
        </>
      ) : null}
    </Screen>
  );
}
