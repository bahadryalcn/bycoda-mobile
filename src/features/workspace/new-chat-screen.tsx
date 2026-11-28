import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Keyboard, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import * as Crypto from "expo-crypto";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import Plus from "lucide-react-native/icons/plus";
import type { HostProject } from "@/domain/types";
import { useActiveMachine, useMachines } from "@/state/machines";
import type { MobileMachine } from "@/remote/types";
import { useHostClient, useHostMutation } from "@/state/queries";
import { useModelCatalog } from "@/state/model-catalog";
import { rememberOpenedProject, useProjectDirectoryPreferences } from "@/state/project-directory-preferences";
import { Body, Button, ErrorNotice, PressableArea, RowIcon, Screen } from "@/ui/primitives";
import { ChatComposer } from "@/ui/chat-composer";
import { ChatCircleAction } from "@/ui/chat-controls";
import { showToast } from "@/ui/toast";
import { MachinePill } from "@/ui/machine-bar";
import { NoComputerState } from "@/ui/no-computer";
import { ProjectIcon } from "@/ui/project-icon";
import { SweepLabel } from "@/ui/text-sweep";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, metrics, space } from "@/ui/tokens";
import { useAppPreferences } from "../navigation-prefs/app-preferences";
import { useKeyCommand } from "../../../modules/bycoda-key-commands";
import { useCommandPalette } from "@/features/keyboard/keyboard-context";
import { useKeyboardPreferences, useKeyboardPreferenceHydration } from "@/features/keyboard/keyboard-preferences";
import { launchFromParams, matchLaunchProject } from "../sharing/model/launch-request";
import { decodeComposerDraft, emptyComposerDraft, encodeComposerDraft } from "./composer-draft";
import { registerWorkspaceDraft } from "./draft-guard";
import { useLocalDraft } from "./use-local-draft";
import { ComposerDictationButton } from "./composer-dictation";
import { ComposerDictationNotice, ComposerRecordingRow } from "./composer-recording";
import { ComposerSendButton } from "./composer-send-button";
import { unavailableAccessModes } from "./composer-access-model";
import type { CreationDraft, RuntimeMode } from "./creation-selection";
import { insertDictation } from "./dictation-model";
import { appendToDraft } from "./draft-append";
import { lastCreationChoices, rememberedDraft, useLastCreationChoice, type LastCreationChoice } from "./last-creation-choice";
import { recentModels, useRecentModels } from "./recent-models";
import {
  NEW_CHAT_DRAFT_KEY,
  createNewChatSendGate,
  newChatAttempt,
  newChatAttemptKey,
  newChatFirstTurn,
  newChatRouteKey,
  newChatRuntimeMode,
  newChatSendState,
  newChatSessionOnlyInput,
  newChatWorktreeCwd,
  resolveNewChatProject,
  seededNewChatText,
  type NewChatAttempt,
  type NewChatPick,
} from "./new-chat-model";
import { carriedSettings, NewChatAttachSheet, NewChatCheckoutRow, NewChatModelChip } from "./new-chat-options";
import {
  newChatAttachmentScope,
  newChatAttachmentScopeKey,
  newChatAttachmentsHere,
  newChatAttachmentsSupported,
  newChatDraftAfterSend,
  NEW_CHAT_ATTACHMENT_SESSION,
  type NewChatAttachmentReference,
} from "./new-chat-attachments";
import { uploadCancellable, type StagedAttachment } from "./attachment-model";
import { isScopedStagedFile, removeStagedFile } from "./attachment-files";
import { attachmentReleases } from "./attachment-ownership";
import { ComposerAttachments } from "./composer-attachments";
import { useComposerAttachments } from "./use-composer-attachments";
import { ProjectDirectorySlot } from "./project-directory-feedback";
import { ProjectFolderBrowser } from "./project-folder-browser";
import { ProjectPicker } from "./project-picker";
import { latestProjectActivity } from "./project-summaries";
import { selectedChoice } from "./provider-choices";
import { orderProjectsByRecency } from "./recent-projects";
import { SessionHeader } from "./session-header";
import { SessionKeyboardFrame } from "./session-keyboard-frame";
import { CommandError } from "./shared";
import { useCreateSession } from "./use-create-session";
import { useDictation } from "./use-dictation";
import { useLatestCallback } from "./use-latest-callback";
import { useProjectActivity } from "./use-project-activity";

/**
 * Where the screen was opened from: a project screen fixes the project (and its worktree folder).
 * A prompt link adds its words (placed in an empty draft, never sent) and the project it names
 * (an id or a unique name on the active computer).
 */
export type NewChatRoute = { projectId?: string; machineId?: string; cwd?: string; prompt?: string; project?: string };

/** Dictation needs a local target identity; the new session has no ID until the first message. */
const DICTATION_TARGET = "new-session-draft";

/**
 * The empty new session: a centred "what should we build" hero whose project, working folder and
 * computer are switched in place, the normal composer (model and access in its model sheet, photos
 * and files behind +), and the first message creating the session (with that message and its
 * attachments as its first turn) before the route becomes `/session/[id]`.
 * The typed draft lives here, above the computer-bound workspace, so switching computers keeps it;
 * it is saved on the phone, so Back or the app being closed keeps it too.
 */
export function NewChatScreen({ route, layout = "phone" }: { route: NewChatRoute; layout?: "phone" | "tablet" | "split" }) {
  const machine = useActiveMachine();
  const copy = useCopy();
  const draft = useNewChatDraft(route.prompt);
  if (!machine)
    return (
      <Screen scroll={false} contentOwnsBottomInset>
        <SessionHeader showBack={layout !== "split"} title={copy("Yeni oturum", "New session")} tone="muted" />
        <View style={{ flex: 1, justifyContent: "center" }}>
          <NoComputerState
            description={copy(
              "Oturumlarını görmek ve başlatmak için bilgisayarını bağla.",
              "Connect your computer to see and start sessions.",
            )}
          />
        </View>
      </Screen>
    );
  return <NewChatWorkspace machine={machine} route={route} layout={layout} draft={draft} />;
}

type NewChatDraft = ReturnType<typeof useNewChatDraft>;

/** The saved new-session draft: the session composer's storage format under one phone-wide key. */
function useNewChatDraft(prompt: string | undefined) {
  const draft = useLocalDraft(NEW_CHAT_DRAFT_KEY, decodeComposerDraft, encodeComposerDraft);
  const { ready, isStored, persist, load, setValue, valueRef, error } = draft;
  // Leaving through a draft guard (computer switch, sign-out) writes unsaved words first.
  useEffect(
    () => (ready && !isStored ? registerWorkspaceDraft(NEW_CHAT_DRAFT_KEY, () => persist()) : undefined),
    [ready, isStored, persist],
  );
  const setText = useCallback((text: string) => {
    if (ready) setValue((current) => ({ ...(current ?? emptyComposerDraft()), text }));
  }, [ready, setValue]);
  // A prompt link fills the draft once, and only when the owner has not typed anything yet.
  const seed = launchFromParams({ prompt })?.text;
  const seeded = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!ready || !seed || seeded.current === seed) return;
    seeded.current = seed;
    const text = seededNewChatText(valueRef.current?.text ?? "", seed);
    if (text !== undefined) setValue((current) => ({ ...(current ?? emptyComposerDraft()), text }));
  }, [ready, seed, setValue, valueRef]);
  /**
   * The create carried these words and files: delivered files leave the draft (and the phone), and
   * the words are cleared unless the owner changed them meanwhile.
   */
  const clearSent = useCallback((sent: { text: string; attachments: readonly StagedAttachment[] }) => {
    const current = valueRef.current;
    const next = current ? newChatDraftAfterSend(current, { text: sent.text, attachmentIds: sent.attachments.map((file) => file.id) }) : undefined;
    if (!next) return;
    try {
      setValue(next);
    } catch {
      return;
    }
    // The staged copies go only once the draft no longer names them.
    void persist().then(() => sent.attachments.forEach(removeStagedFile)).catch(() => {});
  }, [persist, setValue, valueRef]);
  const [retrying, setRetrying] = useState(false);
  const retry = () => {
    if (retrying) return;
    setRetrying(true);
    void (ready ? persist() : load()).catch(() => {}).finally(() => setRetrying(false));
  };
  return {
    text: draft.value?.text ?? "",
    attachments: draft.value?.attachments ?? NO_ATTACHMENTS,
    setText,
    ready,
    error,
    retrying,
    retry,
    clearSent,
    // The shared attachment owner edits the same saved draft.
    store: { valueRef, setValue, persist },
  };
}

const NO_ATTACHMENTS: StagedAttachment[] = [];

type Sent = {
  machineId: string;
  projectId: string;
  text: string;
  firstTurn: boolean;
  /** Staged files the first turn carried; their claims are released once the session exists. */
  attachments: StagedAttachment[];
  remember?: LastCreationChoice;
};

function NewChatWorkspace({
  machine,
  route,
  layout,
  draft: saved,
}: {
  machine: MobileMachine;
  route: NewChatRoute;
  layout: "phone" | "tablet" | "split";
  draft: NewChatDraft;
}) {
  const { text, setText: onTextChange } = saved;
  const copy = useCopy();
  const { colors, uiStyles } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const client = useHostClient();
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Which project: recency, the owner's pick and the shared selection, resolved per computer.
  const activity = useProjectActivity();
  const { preferences } = useProjectDirectoryPreferences(machine.id);
  const { preferences: appPrefs } = useAppPreferences();
  const scopeProjectId = useMachines((state) => state.selectedProjectId);
  const readable = activity.directoryReady && !activity.privacyPending;
  const recentActivity = useMemo(() => latestProjectActivity(activity.directory), [activity.directory]);
  const times = { activity: recentActivity, opened: preferences.recent };
  const ordered = readable
    ? orderProjectsByRecency(activity.projects.data ?? [], { ...times, isVisible: activity.projects.isProjectVisible })
    : [];
  const [picked, setPicked] = useState<NewChatPick>();
  // A prompt link names its project by id or unique name on whichever computer is active.
  const linked = route.project ? matchLaunchProject(ordered, route.project) : undefined;
  const project = resolveNewChatProject({
    machineId: machine.id,
    projects: ordered,
    recency: times,
    picked,
    route: linked ? { ...route, projectId: linked.id, machineId: machine.id } : route,
    scopeProjectId,
    useLast: appPrefs.newSessionUsesLastProject,
  });
  const routeCheckout = () =>
    route.projectId && route.cwd ? { machineId: route.machineId ?? machine.id, projectId: route.projectId, cwd: route.cwd } : undefined;
  const [checkout, setCheckout] = useState(routeCheckout);
  // The one new session is brought to the front again by the next "New session" (the stack keeps
  // a single copy); a route that names a project then replaces the earlier pick and folder.
  const routeKey = newChatRouteKey(route);
  const [seenRouteKey, setSeenRouteKey] = useState(routeKey);
  if (routeKey !== seenRouteKey) {
    setSeenRouteKey(routeKey);
    if (routeKey !== undefined) {
      setPicked(undefined);
      setCheckout(routeCheckout());
    }
  }
  const worktreeCwd = checkout?.machineId === machine.id ? newChatWorktreeCwd(project, checkout) : undefined;

  // Which model: the owner's pick on this computer, else the last one used here while it is offered.
  const catalogData = useModelCatalog(project?.id ?? "", !!project).data;
  const remembered = rememberedDraft(useLastCreationChoice(machine.id), catalogData);
  const recents = useRecentModels(machine.id);
  const [choice, setChoice] = useState<{ machineId: string; draft: CreationDraft; settings: Record<string, string> }>();
  const mine = choice?.machineId === machine.id ? choice : undefined;
  const draft = mine?.draft ?? remembered ?? { model: "" };
  const settings = mine?.settings ?? {};
  const [requestedMode, setRuntimeMode] = useState<RuntimeMode>("supervised");
  const { catalog, command, uncertain, locked, canStart, create, selection, choices } = useCreateSession(project?.id ?? "", {
    cwd: worktreeCwd,
    catalogEnabled: !!project,
    draft,
  });
  const { selectedProvider, selectedAccountId, selectedModel, models } = selection;
  // A mode the chosen agent cannot run is never shown as chosen or sent.
  const unavailable = unavailableAccessModes(catalog.data, selectedProvider ?? "");
  const runtimeMode = newChatRuntimeMode(requestedMode, unavailable);
  const providerChoice = selectedChoice(choices, selectedProvider, selectedAccountId);
  const catalogReady = !catalog.isPending || catalog.fetchStatus !== "fetching";
  const catalogState = !catalogReady
    ? ("loading" as const)
    : selectedProvider || choices.length
      ? undefined
      : catalog.isPending
        ? ("waiting" as const)
        : catalog.error
          ? ("error" as const)
          : ("empty" as const);
  const pick = (next: Omit<NonNullable<typeof choice>, "machineId">) => {
    if (!locked) setChoice({ machineId: machine.id, ...next });
  };

  // One send = one create command carrying the prompt as its first turn. The IDs stay stable for
  // the same payload, so resending after a lost reply returns the existing session, never a second.
  const firstTurn = !!machine.capabilities?.includes("sessions.createFirstTurn");
  const attempt = useRef<NewChatAttempt | undefined>(undefined);
  const sent = useRef<Sent | undefined>(undefined);
  const [sendGate] = useState(createNewChatSendGate);
  // A refused command was not applied: the next send is a new attempt with new IDs.
  useEffect(() => {
    if (command.error && !uncertain) attempt.current = undefined;
  }, [command.error, uncertain]);
  // A first turn is plain text; the session composer's own commands and crew delegations wait for
  // the open session. Without a first turn the words land in that composer, which resolves them.
  const sessionOnly = firstTurn ? newChatSessionOnlyInput(text) : undefined;

  // Attachments: staged on the phone for this computer, uploaded on Send and carried by the first
  // turn, so the session and its first message with files stay one idempotent create.
  const attachSupported = newChatAttachmentsSupported(machine.capabilities);
  const attachmentScope = useMemo(() => newChatAttachmentScope(machine.id), [machine.id]);
  const attachmentScopeKey = newChatAttachmentScopeKey(machine.id);
  const submission = useRef(false);
  const [attachError, setAttachError] = useState<unknown>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  // The phone-wide draft keeps other computers' files; only this computer's count toward the limit.
  const stagedHere = useCallback((file: StagedAttachment) => newChatAttachmentsHere([file], (entry) => isScopedStagedFile(entry, attachmentScopeKey)).length === 1, [attachmentScopeKey]);
  const uploads = useComposerAttachments({
    scope: attachmentScope,
    client,
    draft: saved.store,
    submission,
    mounted,
    setLocalError: setAttachError,
    counted: stagedHere,
  });
  const staged = useMemo(
    () => attachSupported ? newChatAttachmentsHere(saved.attachments, stagedHere) : NO_ATTACHMENTS,
    [attachSupported, saved.attachments, stagedHere],
  );
  const attaching = uploads.uploading || uploads.picking;
  // While files upload the create is already decided: its project, computer and model stay put.
  const frozen = locked || uploads.uploading;

  const sendState = newChatSendState({
    text,
    attachments: staged.length,
    uploading: attaching,
    project: !!project,
    canStart,
    locked: locked || !saved.ready,
    connected: !!client,
    sessionOnly,
  });
  /** The session exists: its words were delivered (or wait in its composer), so this draft is done. */
  const settled = (target: Sent, sessionId: string) => {
    attempt.current = undefined;
    // Older Hosts create without a first turn: the words wait in the new session's composer instead.
    if (!target.firstTurn) appendToDraft({ machineId: target.machineId, sessionId }, { text: target.text });
    saved.clearSent(target);
    if (target.attachments.length) {
      // The session's first message now references the files, so the draft's claims can go.
      const files = target.attachments.map((file) => uploads.claimedFiles.current.get(file.id) ?? file);
      files.forEach((file) => uploads.claimedFiles.current.delete(file.id));
      const owner = useMachines.getState().machines.find((entry) => entry.id === target.machineId);
      if (owner)
        void attachmentReleases
          .stage({ machine: owner }, NEW_CHAT_ATTACHMENT_SESSION, files)
          .then(() => (client && client.machine.id === target.machineId ? attachmentReleases.flush(client) : undefined))
          .catch(() => {});
    }
    if (target.remember) {
      void lastCreationChoices.getState().remember(target.machineId, target.remember);
      void recentModels.getState().record(target.machineId, target.remember);
    }
    void rememberOpenedProject(target.machineId, target.projectId).catch(() => {});
  };
  const opened = (target: Sent, sessionId: string) => {
    settled(target, sessionId);
    if (!mounted.current) return;
    if (useMachines.getState().activeId === target.machineId) useMachines.getState().selectProject(target.projectId);
    router.replace({
      pathname: "/session/[id]",
      params: { id: sessionId, projectId: target.projectId, machineId: target.machineId },
    });
  };
  const send = useLatestCallback(() => {
    if (!sendState.enabled || !project) return;
    // A second tap or a held Enter lands before the pending state renders: it must neither send
    // again nor reset (and so detach) the command the first one is waiting for.
    if (!sendGate.claim()) return;
    command.reset();
    setAttachError(null);
    const prompt = text.trim();
    const files = staged;
    const payload = {
      machineId: machine.id,
      projectId: project.id,
      cwd: worktreeCwd,
      provider: selectedProvider,
      accountId: selectedAccountId,
      model: selectedModel,
      settings,
      runtimeMode,
      text: prompt,
      firstTurn,
      attachments: files.map((file) => file.id),
    };
    const next = newChatAttempt(attempt.current, newChatAttemptKey(payload), () => Crypto.randomUUID());
    attempt.current = next;
    const target: Sent = {
      machineId: machine.id,
      projectId: project.id,
      text: prompt,
      firstTurn,
      attachments: files,
      remember: selectedProvider && selectedModel
        ? { provider: selectedProvider, ...(selectedAccountId ? { accountId: selectedAccountId } : {}), model: selectedModel }
        : undefined,
    };
    sent.current = target;
    submission.current = true;
    void (async () => {
      // Uploads resume where they stopped, so "Send again" repeats them cheaply before the same create.
      const references: NewChatAttachmentReference[] = [];
      if (files.length) {
        if (!client) return;
        const controller = new AbortController();
        uploads.begin(controller);
        try {
          for (const file of files) references.push(await uploads.upload(file, controller));
        } catch {
          // Each attachment card shows its own failure and retry; nothing was created.
          return;
        } finally {
          uploads.end();
        }
        if (controller.signal.aborted || !mounted.current) return;
      }
      await create((sessionId) => opened(target, sessionId), {
        settings,
        runtimeMode,
        commandId: next.createId,
        ...(firstTurn ? { firstTurn: newChatFirstTurn(prompt, next.turnId, references) } : {}),
      });
    })().finally(() => {
      submission.current = false;
      sendGate.release();
    });
  });
  // Resending after a lost reply reuses the same IDs; it waits for the lock to clear first.
  const [resending, setResending] = useState(false);
  useEffect(() => {
    if (!resending || locked) return;
    setResending(false);
    send();
  }, [resending, locked, send]);

  // Dictation writes into the same draft at the cursor; it never sends.
  const selectionRef = useRef({ start: 0, end: 0 });
  const textRef = useRef(text);
  textRef.current = text;
  const dictation = useDictation({
    machineId: machine.id,
    sessionId: DICTATION_TARGET,
    locked,
    onText: (spoken) => {
      const base = textRef.current;
      const next = insertDictation(base, selectionRef.current, spoken);
      selectionRef.current = next.selection;
      if (next.text !== base) onTextChange(next.text);
    },
  });

  // Project picker and "Add project" (folder browser), both without leaving the draft.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  // Hardware keyboard: the same Send shortcuts as an open session's composer.
  useKeyboardPreferenceHydration();
  const enterSends = useKeyboardPreferences((state) => state.hydrated && !state.error && state.enterSends);
  const routeFocused = useIsFocused();
  const palette = useCommandPalette();
  const [inputFocused, setInputFocused] = useState(false);
  const keyboardActive = routeFocused && inputFocused && !palette.visible && !pickerOpen && !adding && !attachOpen;
  const hardwareSend = () => send();
  useKeyCommand({ key: "Enter", primary: true, title: copy("Gönder", "Send"), enabled: keyboardActive, textInput: true }, hardwareSend);
  useKeyCommand({ key: "Enter", title: copy("Gönder", "Send"), enabled: keyboardActive && enterSends, textInput: true }, hardwareSend);
  const openProject = useHostMutation<HostProject>("projects.open", ["projects"]);
  const openFolder = (cwd: string) => {
    if (openProject.isPending) return;
    const origin = machine.id;
    void openProject.mutateAsync({ cwd }).then((created) => {
      if (!mounted.current) return;
      setAdding(false);
      setPicked({ machineId: origin, id: created.id, cwd: created.cwd });
    }, () => {
      // The folder browser shows the failure.
    });
  };

  const heroTitle = copy("Ne yapalım?", "What should we build?");
  const projectControl = !readable || !ordered.length ? (
    <View style={{ alignSelf: "stretch", minHeight: metrics.touchTarget }}>
      <ProjectDirectorySlot
        query={{ ...activity.projects, refetch: activity.refetch }}
        readiness={activity.readiness}
        privacyUnavailable={activity.privacyUnavailable}
        empty={readable && !ordered.length}
        compact
        loadingLabel={copy("Projeler yükleniyor…", "Loading projects…")}
        emptyTitle={copy("Bu bilgisayarda henüz proje yok.", "No projects on this computer yet.")}
        emptyIllustration="no-projects"
        emptyAction={{ label: copy("Proje ekle", "Add project"), onPress: () => setAdding(true) }}
      />
    </View>
  ) : (
    <PressableArea
      label={project
        ? `${copy("Proje", "Project")}: ${project.name}. ${copy("Proje seç", "Choose a project")}`
        : copy("Proje seç", "Choose a project")}
      expanded={pickerOpen}
      disabled={frozen}
      onPress={() => setPickerOpen(true)}
      style={{
        minHeight: metrics.touchTarget,
        maxWidth: "100%",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space.sm,
        paddingHorizontal: space.sm,
      }}
    >
      {project ? <ProjectIcon appearance={project.appearance} size={18} box={24} /> : null}
      <Body
        numberOfLines={2}
        selectable={false}
        style={{
          flexShrink: 1,
          textAlign: "center",
          fontSize: fontSize.heading,
          lineHeight: lineHeight.heading,
          fontWeight: "600",
          color: colors.accent,
          textDecorationLine: "underline",
        }}
      >
        {project?.name ?? copy("Proje seç", "Choose a project")}
      </Body>
      <ChevronDown size={16} strokeWidth={2.4} color={colors.accent} style={{ flexShrink: 0 }} />
    </PressableArea>
  );

  // Only the start's progress stays above the composer; the draft's options live in the hero
  // (working folder) and in the model sheet (access).
  // Uploading on Send can be cancelled like the session composer's upload; nothing is created then
  // and each card keeps its retry.
  const starting = command.isPending || uploads.uploading ? (
    <View style={{ gap: space.xs }}>
      <View style={{ minHeight: metrics.chipHeight, justifyContent: "center", paddingHorizontal: space.sm }} accessibilityLiveRegion="polite">
        <SweepLabel active color={colors.muted} style={uiStyles.caption}>
          {copy("Oturum başlatılıyor…", "Starting session…")}
        </SweepLabel>
      </View>
      {uploadCancellable(uploads.uploading, uploads.transfers) ? (
        <Button tone="quiet" density="compact" label={copy("Yüklemeyi iptal et", "Cancel upload")} onPress={uploads.cancel} />
      ) : null}
    </View>
  ) : null;
  const checkoutRow = project && readable && ordered.length ? (
    <NewChatCheckoutRow
      machineId={machine.id}
      project={project}
      cwd={worktreeCwd}
      disabled={frozen}
      onChange={(cwd) => setCheckout(cwd ? { machineId: machine.id, projectId: project.id, cwd } : undefined)}
    />
  ) : null;
  const composerBlocked = frozen || attaching || !saved.ready;

  const composer = (
    <View style={{ gap: space.sm }}>
      {dictation.error ? <ComposerDictationNotice dictation={dictation} /> : null}
      {command.error ? (
        <View style={{ gap: space.xs }}>
          <CommandError
            error={command.error}
            onRecovered={(receipt) => {
              const target = sent.current;
              command.reset();
              if (!target) return;
              // Found after a computer switch: the session is on the other computer, so the draft
              // is settled there and this screen stays on the computer now chosen.
              if (target.machineId !== machine.id) settled(target, receipt.sessionId);
              else opened(target, receipt.sessionId);
            }}
            onDismiss={() => {
              // The IDs stay: sending the same words again replays the first create if it landed.
              command.reset();
            }}
          />
          {uncertain ? (
            <>
              <Body muted style={uiStyles.caption}>
                {copy(
                  "Aynı istek yeniden gönderilir; bilgisayar ilkini aldıysa ikinci bir oturum açılmaz.",
                  "The same request is sent again; if the computer already received it, no second session is created.",
                )}
              </Body>
              <Button label={copy("Yeniden gönder", "Send again")} onPress={() => {
                command.reset();
                setResending(true);
              }} />
            </>
          ) : null}
        </View>
      ) : null}
      {saved.error ? (
        <View style={{ gap: space.xs }}>
          <ErrorNotice error={saved.error} />
          <Button
            busy={saved.retrying}
            label={saved.ready
              ? copy("Taslağı kaydetmeyi yeniden dene", "Retry saving draft")
              : copy("Taslağı yeniden yükle", "Retry loading draft")}
            onPress={saved.retry}
          />
        </View>
      ) : null}
      {attachError ? <ErrorNotice error={attachError} /> : null}
      {starting}
      {sessionOnly && text.trim() ? (
        <Body muted style={uiStyles.caption} accessibilityLiveRegion="polite">
          {sessionOnly === "crew"
            ? copy(
                "Ekip veya ajana görev vermek oturum açıldıktan sonra kullanılabilir.",
                "Delegating to a crew or agent is available once the session has started.",
              )
            : copy("Bu komut oturum açıldıktan sonra kullanılabilir.", "This command is available once the session has started.")}
        </Body>
      ) : null}
      <ChatComposer
        value={text}
        onValueChange={onTextChange}
        disabled={composerBlocked}
        top={staged.length ? (
          <ComposerAttachments
            files={staged}
            scope={attachmentScopeKey}
            transfers={uploads.transfers}
            disabled={composerBlocked}
            onRetry={(file) => { void uploads.retry(file); }}
            onRemove={uploads.remove}
          />
        ) : undefined}
        leading={attachSupported ? (
          <ChatCircleAction
            label={copy("Mesaja ekle", "Add to message")}
            disabled={composerBlocked}
            busy={uploads.picking}
            onPress={() => {
              Keyboard.dismiss();
              setAttachOpen(true);
            }}
          >
            <Plus size={19} strokeWidth={2.2} color={colors.text} />
          </ChatCircleAction>
        ) : !composerBlocked ? (
          // Like the blocked microphone: an older computer keeps the control dimmed and a tap says why.
          <ChatCircleAction
            label={copy("Dosya eklemek için bilgisayarındaki bycoda'yı güncelle", "Update bycoda on your computer to attach files")}
            onPress={() => showToast({
              tone: "info",
              message: copy("Dosya eklemek için bilgisayarındaki bycoda'yı güncelle", "Update bycoda on your computer to attach files"),
            })}
          >
            <Plus size={19} strokeWidth={2.2} color={colors.tertiary} />
          </ChatCircleAction>
        ) : null}
        model={project ? ({ iconOnly }) => (
          <NewChatModelChip
            iconOnly={iconOnly}
            ready={catalogReady}
            catalogState={catalogState}
            catalog={catalog.data}
            choices={choices}
            choice={providerChoice}
            models={models}
            model={selectedModel}
            settings={settings}
            access={selectedProvider !== "fx"
              ? { value: runtimeMode, unavailable, onChange: setRuntimeMode }
              : undefined}
            disabled={frozen}
            onRetry={() => { void catalog.refetch().catch(() => {}); }}
            onChooseProvider={(next) => {
              const changed = next.provider !== selectedProvider;
              pick({
                draft: { provider: next.provider, accountId: next.accountId, model: changed ? "" : draft.model },
                settings: carriedSettings(settings, changed),
              });
            }}
            onChooseModel={(next, model, nextSettings) =>
              pick({ draft: { provider: next.provider, accountId: next.accountId, model }, settings: nextSettings })}
            onChange={(model, nextSettings) => pick({ draft: { ...draft, model }, settings: nextSettings })}
            recents={recents}
          />
        ) : undefined}
        field={{
          accessibilityLabel: copy("Mesaj", "Message"),
          placeholder: copy("Mesaj", "Message"),
          onFocus: () => setInputFocused(true),
          onBlur: () => setInputFocused(false),
          onSelectionChange: (event) => { selectionRef.current = event.nativeEvent.selection; },
          disableFullscreenUI: true,
          submitBehavior: "newline",
          maxLength: 256_000,
        }}
        secondarySubmit={<ComposerDictationButton dictation={dictation} />}
        actionRow={dictation.phase !== "idle" ? <ComposerRecordingRow dictation={dictation} /> : undefined}
        submit={
          <ComposerSendButton
            mode="send"
            alternate={null}
            disabled={!sendState.enabled}
            busy={command.isPending || uploads.uploading}
            onSend={() => send()}
          />
        }
      />
    </View>
  );

  return (
    <Screen scroll={false} contentOwnsBottomInset>
      <SessionHeader showBack={layout !== "split"} title={copy("Yeni oturum", "New session")} tone="muted" />
      <SessionKeyboardFrame
        composer={composer}
        style={{
          flex: 1,
          width: "100%",
          maxWidth: metrics.contentWidth,
          alignSelf: "center",
          paddingLeft: Math.max(insets.left, space.screen),
          paddingRight: Math.max(insets.right, space.screen),
        }}
      >
        {/* The hero centres in the space above the composer and scrolls when large text or the
            keyboard leaves too little room; it is the only scrolling owner of this region. */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: space.xxl, gap: space.md }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentInsetAdjustmentBehavior="never"
        >
          <View style={{ alignItems: "center", gap: space.md }}>
            <Body
              accessibilityRole="header"
              style={{ textAlign: "center", fontSize: fontSize.hero, lineHeight: lineHeight.hero, fontWeight: "600", color: colors.text }}
            >
              {heroTitle}
            </Body>
            {/* Project, then where in it the session works, then the computer. */}
            <View style={{ alignItems: "center", alignSelf: "stretch" }}>
              {projectControl}
              {checkoutRow}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "center", maxWidth: "100%" }}>
              <MachinePill disabled={frozen} />
            </View>
          </View>
        </ScrollView>
      </SessionKeyboardFrame>
      <ProjectPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedId={project?.id ?? null}
        recentActivity={recentActivity}
        addProjectIcon={<RowIcon glyph={Plus} />}
        onAddProject={() => {
          setPickerOpen(false);
          openProject.reset();
          setAdding(true);
        }}
        onSelect={(item) => {
          setPickerOpen(false);
          setPicked({ machineId: machine.id, id: item.id, cwd: item.cwd });
        }}
      />
      <NewChatAttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onChoose={(kind) => {
          setAttachOpen(false);
          void uploads.choose(kind);
        }}
      />
      {adding ? <ProjectFolderBrowser onClose={() => setAdding(false)} mutation={openProject} onOpen={openFolder} /> : null}
    </Screen>
  );
}
