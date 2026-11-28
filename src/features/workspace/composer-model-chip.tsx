import { useEffect, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import { carryCrossDelegation } from "../../../../src/shared/model/host-contracts/delegation";
import { useFormDraft, sameFormValue } from "@/state/form-draft";
import { captureSessionAuthority } from "@/domain/session-authority";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine } from "@/state/machines";
import { useModelCatalog } from "@/state/model-catalog";
import { RemoteHostError } from "@/remote/host-error";
import { Notice, QueryState } from "@/ui/primitives";
import { ChatToolbarAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { errorMessage, translateErrorText } from "@/ui/error-message";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import {
  catalogProviders,
  activeSessionModel,
  modelDefaults,
  sessionCatalog,
  sessionModel,
  sessionSettings,
} from "./catalog";
import { ComposerModelMark } from "./composer-model-mark";
import { ModelPicker } from "./model-picker";
import { settingsSummary } from "./model-picker-model";
import { settingLabels } from "./setting-labels";
import { effortLabel, foldedVariant } from "./model-variants";
import { choiceKey, providerChoices, selectedChoice } from "./provider-choices";
import type { SessionCommand } from "./session-types";
import type { HostSession, RuntimeMode } from "./wire";
import { ComposerAccessField, accessModeLabel } from "./composer-access";
import { composerAccessAvailable, unavailableAccessModes } from "./composer-access-model";
import { ComposerContextSection } from "./composer-context-meter";
import type { ComposerContextReading } from "./composer-context";
import { useModelSheetRequest } from "./composer-model-sheet";
import { recentModels, useRecentModels } from "./recent-models";

/**
 * Composer toolbar chip: provider mark, model and effort of the session, always visible in the
 * toolbar. A short measured slot shows only the mark; the spoken label stays complete. Full access
 * adds a warning glyph. Tapping it opens the one "Model and access" sheet (agent, account, effort,
 * model, access and the context reading); choices stay in its draft until Save while the agent is idle.
 */
export function ComposerModelChip({
  machineId,
  session,
  blocked,
  iconOnly = false,
  context,
  onCommand,
}: {
  machineId: string;
  session: HostSession;
  blocked: boolean;
  /** The measured toolbar slot is too short for the label. */
  iconOnly?: boolean;
  /** The context reading and Compact now, shown inside the sheet. */
  context?: { reading: ComposerContextReading; compactDisabled: boolean; onCompact?: () => void };
  onCommand: SessionCommand;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const machine = useActiveMachine();
  const catalog = useModelCatalog(session.projectId);
  const configure = useAsyncAction();
  const recents = useRecentModels(machineId);
  const [open, setOpen] = useState(false);
  const draftOf = (value: HostSession) => ({
    provider: value.session.harness,
    accountId: value.session.providerAccountId,
    model: value.session.model,
    settings: value.session.modelSettings,
    access: value.session.runtimeMode as RuntimeMode,
  });
  const form = useFormDraft(() => draftOf(session));
  const [reviewed, setReviewed] = useState(session);
  const {
    provider: harness,
    accountId: providerAccountId,
    model,
    settings: modelSettings,
    access,
  } = form.values;
  // The draft includes the access mode, so a mode changed elsewhere is a conflict too.
  const conflict =
    open &&
    (!sameFormValue(draftOf(session), draftOf(reviewed)) ||
      session.authorityGeneration !== reviewed.authorityGeneration);
  const failure = configure.error;
  // A save whose reply was lost may have landed: hold it until the owner rechecks the current model.
  const uncertain =
    !!failure && (!(failure instanceof RemoteHostError) || failure.uncertain || failure.kind === "timeout");
  const running = session.status === "running";
  const providers = [...new Set([harness, ...catalogProviders(machine?.providers, catalog.data)])];
  const available = sessionCatalog(catalog.data, providers);
  const switchAllowed = machine?.capabilities?.includes("sessions.harnessSwitch");
  const choices = providerChoices(
    providers.filter((item) => switchAllowed || item === harness),
    catalog.data?.accounts,
    copy("Varsayılan hesap", "Default account"),
  );
  const savedChoice = choices.find((entry) => entry.key === choiceKey(harness, providerAccountId));
  const unavailableAccount =
    (harness === "claude" || harness === "codex") &&
    Array.isArray(catalog.data?.accounts?.[harness]) &&
    !savedChoice;
  const choice = unavailableAccount
    ? {
        key: choiceKey(harness, providerAccountId),
        provider: harness,
        label: copy("Hesap kullanılamıyor", "Account unavailable"),
      }
    : (savedChoice ?? selectedChoice(choices, harness, providerAccountId));
  const apply = (next: typeof form.values) => {
    if (blocked || running || configure.isPending) return;
    form.patch(next);
  };
  const save = async () => {
    if (
      !form.dirty ||
      blocked ||
      running ||
      configure.isPending ||
      unavailableAccount ||
      conflict ||
      uncertain ||
      !model
    )
      return;
    const submitted = form.values;
    const selected = sessionModel(available, harness, model);
    const saved = await configure.run(async () => {
      await onCommand({
        type: "configure",
        sessionId: reviewed.session.id,
        ...captureSessionAuthority(reviewed),
        ...(reviewed.revision !== undefined ? { expectedRevision: reviewed.revision } : {}),
        harness,
        ...(harness === "claude" || harness === "codex"
          ? { providerAccountId: providerAccountId ?? null }
          : {}),
        model,
        modelSettings: selected ? sessionSettings(selected, modelSettings) : modelSettings,
        // Harnesses without an access model keep the reviewed mode.
        runtimeMode: reviewed.session.harness === "fx" ? reviewed.session.runtimeMode : access,
      });
      return true;
    });
    if (saved === true) {
      form.markSaved(submitted);
      setOpen(false);
      const before = reviewed.session;
      if (
        before.harness !== submitted.provider ||
        (before.providerAccountId ?? undefined) !== (submitted.accountId ?? undefined) ||
        before.model !== submitted.model
      )
        // The model left stays one tap away, the new one leads.
        void recentModels.getState().record(
          machineId,
          { provider: submitted.provider, accountId: submitted.accountId ?? undefined, model: submitted.model },
          ...(before.model ? [{ provider: before.harness, accountId: before.providerAccountId ?? undefined, model: before.model }] : []),
        );
    }
  };
  const openSheet = () => {
    configure.reset();
    form.reset(draftOf(session));
    setReviewed(session);
    setOpen(true);
    // The catalog refreshes slowly in the background; the picker shows a fresh one.
    void catalog.refetch();
  };
  // Session options, session settings and the context ring open this same sheet and draft.
  const requested = useModelSheetRequest((state) => state.target);
  useEffect(() => {
    if (requested && useModelSheetRequest.getState().consume(machineId, session.session.id)) openSheet();
    // The request is the only trigger; openSheet reads the current session when it fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, machineId, session.session.id]);
  const models = available.models[harness] ?? [];
  const { name, model: summaryModel } = activeSessionModel(session.session, available);
  const labels = settingLabels(copy);
  const summary = settingsSummary(summaryModel, session.session.modelSettings, labels);
  // A model listed once per effort ("Gemini 4 Hydrogen (Low)") reads like any other model with an
  // effort setting; like the picker, only a family with two or more listed variants folds.
  const variant = foldedVariant(name, models, (entry) => entry.name);
  const variantEffort = variant ? effortLabel(variant.variant) : "";
  const baseName = variant ? `${variant.family} · ${labels[variantEffort] ?? variantEffort}` : name;
  const shown = summary ? `${baseName} · ${summary}` : baseName;
  const accessShown = composerAccessAvailable(session);
  const fullAccess = accessShown && session.session.runtimeMode === "full-access";
  // Accounts are told apart by colour on the chip; the spoken label names the account.
  const sessionChoice = choices.find((entry) => entry.key === choiceKey(session.session.harness, session.session.providerAccountId));
  const severalAccounts = choices.filter((entry) => entry.provider === session.session.harness).length > 1;
  const spoken = [
    severalAccounts && sessionChoice ? `${shown}, ${sessionChoice.label}` : shown,
    accessShown ? `${copy("Erişim", "Access")}: ${accessModeLabel(session.session.runtimeMode as RuntimeMode, copy)}` : "",
  ].filter(Boolean).join(". ");
  const title = accessShown ? copy("Model ve erişim", "Model and access") : copy("Model", "Model");
  const sheetLocked = blocked || running || configure.isPending;
  return (
    <>
      <ChatToolbarAction
        label={fontScale >= 1.35 ? name : shown}
        hideLabel={iconOnly}
        reserveTouchTarget
        accessibilityLabel={`${title}: ${spoken}`}
        disabled={blocked}
        onPress={openSheet}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
          <ComposerModelMark session={session} />
          {fullAccess ? <ShieldAlert size={14} strokeWidth={2.2} color={colors.warning} /> : null}
        </View>
      </ChatToolbarAction>
      <ModelPicker
        title={title}
        extra={
          accessShown || context ? (
            <>
              {accessShown ? (
                <ComposerAccessField
                  value={access}
                  saved={session.session.runtimeMode as RuntimeMode}
                  unavailable={unavailableAccessModes(catalog.data, harness)}
                  disabled={sheetLocked || unavailableAccount}
                  onChange={(mode) => apply({ ...form.values, access: mode })}
                />
              ) : null}
              {context ? (
                <ComposerContextSection
                  reading={context.reading}
                  compactDisabled={context.compactDisabled || form.dirty || configure.isPending}
                  compactReason={form.dirty
                    ? copy("Önce seçimlerini kaydet veya bırak.", "Save or discard your choices first.")
                    : copy("Geçerli işlemin bitmesini bekle", "Wait for the current operation to finish")}
                  onCompact={context.onCompact ? () => {
                    setOpen(false);
                    context.onCompact?.();
                  } : undefined}
                />
              ) : null}
            </>
          ) : undefined
        }
        visible={open}
        onClose={() => setOpen(false)}
        dirty={form.dirty}
        // Only a save in flight spins Save and holds the sheet; a blocked session explains itself below.
        pending={configure.isPending}
        onSave={() => {
          void save();
        }}
        saveDisabled={conflict || uncertain || !model}
        catalog={available}
        choices={choices}
        choice={choice}
        recents={recents}
        accountUsage
        unavailableAccount={unavailableAccount}
        onChooseProvider={(next) => {
          if (next.provider === harness)
            return apply({
              provider: harness,
              accountId: next.accountId,
              model,
              settings: modelSettings,
              access,
            });
          const first = sessionModel(available, next.provider, "");
          apply({
            provider: next.provider,
            accountId: next.accountId,
            model: first?.id ?? "",
            settings: carryCrossDelegation(modelSettings, modelDefaults(first)),
            access,
          });
        }}
        onChooseModel={(next, id, settings) =>
          apply({ provider: next.provider, accountId: next.accountId, model: id, settings, access })
        }
        models={models}
        model={model}
        settings={modelSettings}
        disabled={blocked || running || configure.isPending}
        // One notice per action area, the most urgent first.
        notice={
          conflict ? (
            <Notice
              tone="warning"
              message={copy(
                "Oturum değişti. Ayarları kapatıp yeniden incele.",
                "Session changed. Close settings and review again.",
              )}
            />
          ) : uncertain ? (
            <Notice
              tone="warning"
              message={copy(
                "Değişikliğin kaydedilip kaydedilmediği bilinmiyor. Otomatik olarak yeniden denenmeyecek.",
                "It is unknown whether the change was saved. It will not be retried automatically.",
              )}
              action={{
                label: copy("Geçerli modeli kontrol et", "Check current model"),
                onPress: () => {
                  configure.reset();
                  form.reset(draftOf(session));
                  setReviewed(session);
                },
              }}
            />
          ) : failure ? (
            <Notice
              tone="danger"
              message={`${errorMessage(failure, copy)} ${copy("Seçimin korundu; Kaydet ile yeniden dene.", "Your choice is kept; press Save to try again.")}`}
            />
          ) : running ? (
            <Notice
              tone="info"
              message={copy(
                "Model, mevcut çalışma tamamlanınca değiştirilebilir.",
                "The model can change after the current run finishes.",
              )}
            />
          ) : blocked ? (
            <Notice
              tone="info"
              message={copy(
                "Bu oturumda başka bir işlem sürüyor veya bağlantı bekleniyor. Bitince kaydedebilirsin.",
                "Another action is in progress in this session or the connection is pending. You can save once it finishes.",
              )}
            />
          ) : unavailableAccount ? (
            <Notice
              tone="warning"
              message={copy(
                "Kaydedilmiş hesap kullanılamıyor. Modeli değiştirmek için kullanılabilir bir hesap seç.",
                "The saved account is unavailable. Choose an available account to change the model.",
              )}
            />
          ) : catalog.data?.errors?.[harness] ? (
            // The Host's own wording stays as the detail below a localized lead-in.
            <Notice
              tone="danger"
              message={`${copy("Bu ajanın model listesi okunamadı.", "This agent's model list could not be read.")}\n\n${
                translateErrorText(catalog.data.errors[harness], copy) ?? catalog.data.errors[harness]}`}
            />
          ) : (
            <QueryState query={catalog} />
          )
        }
        onChange={(next, settings) => {
          if (!unavailableAccount)
            apply({ provider: harness, accountId: providerAccountId, model: next, settings, access });
        }}
      />
    </>
  );
}
