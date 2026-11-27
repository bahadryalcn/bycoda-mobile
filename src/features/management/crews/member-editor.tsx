import { truncateGraphemes } from "../../../../../src/shared/lib/text/truncate";
import { metrics, space } from "@/ui/tokens";
import { catalogProviders } from "../../workspace/catalog";
import { ModelChoiceField } from "../../workspace/model-selection/model-choice-field";
import { FixedModelField } from "../../workspace/model-selection/model-selection-field";
import { memberChoice, memberChoicePatch, memberFixedModel, withMemberFixedModel } from "./member-model";
import { useRef, useState } from "react";
import type { HostInstance } from "react-native";
import type { ReactNode } from "react";
import type { HostModelCatalog } from "@/domain/types";
import type { CrewAgent, CrewCandidate } from "@/remote/contracts/crews";
import { useFormDraft } from "@/state/form-draft";
import { useActiveMachine } from "@/state/machines";
import { useCopy } from "@/ui/copy";
import { crewRoleOptions, crewCatalogState, type CrewCatalogRead } from "./presentation";
import { Body, Button, NavigationRow, Sheet, Input, Disclosure, ErrorText, Field, FormActions, Heading, Section, SelectField, Stack, StatusLine } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import { MemberLookFields } from "./member-look-fields";
import { modelSettingLabels } from "../shared/model-setting-labels";
import { settingLabel } from "../../workspace/agent-model-settings";
import {
  crewNameError,
  crewValidationMessage,
  memberValidation,
  memberValidationFeedback,
} from "./model";

export function useRoleOptions() {
  const copy = useCopy();
  return crewRoleOptions(copy);
}

export function MemberEditor({
  initial,
  catalog,
  catalogRead,
  groupsSupported,
  lookSupported,
  busy,
  disabled,
  feedback,
  extraFields,
  extraDirty,
  endAction,
  onSave,
  onClose,
}: {
  initial: CrewAgent;
  catalog?: HostModelCatalog;
  catalogRead?: CrewCatalogRead;
  groupsSupported: boolean;
  /** Host has `crews.identity.v1`: show the handle and look fields. */
  lookSupported?: boolean;
  busy: boolean;
  disabled?: boolean;
  feedback?: ReactNode;
  extraFields?: ReactNode;
  extraDirty?: boolean;
  endAction?: ReactNode;
  onSave: (member: CrewAgent) => void;
  onClose: () => void;
}) {
  const copy = useCopy();
  const settingText = modelSettingLabels(copy);
  const form = useFormDraft(() => structuredClone(initial));
  const draft = form.values;
  const locked = busy || disabled;
  const machine = useActiveMachine();
  const providers = catalogProviders(machine?.providers, catalog);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const instructionsTrigger = useRef<HostInstance>(null);
  const [groups, setGroups] = useState((initial.groups ?? []).join(", "));
  const [nameTouched, setNameTouched] = useState(false);
  const [modelsTouched, setModelsTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { requestClose } = useSheetGuard({
    dirty: form.dirty || extraDirty || groups !== (initial.groups ?? []).join(", "),
    pending: busy,
    onClose,
  });
  const roles = useRoleOptions();
  const models = Object.values(catalog?.models ?? {}).flatMap((rows) => rows ?? []);
  const catalogState = catalogRead?.state ?? crewCatalogState(catalog, null);
  const changeCandidate = (id: string, patch: Partial<CrewCandidate>) =>
    form.patch({
      candidates: draft.candidates.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  const normalized = {
    ...draft,
    ...(groupsSupported
      ? {
          groups: groups
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        }
      : {}),
  };
  const error = memberValidation(normalized);
  const blockedReason = disabled
    ? copy("Bu bilgisayarda düzenleme kullanılamıyor.", "Editing is unavailable on this computer.")
    : crewValidationMessage(error, copy, true);
  const instructionsLabel = copy("Talimatlar", "Instructions");
  const instructionsPreview = truncateGraphemes(
    draft.instructions.replace(/\s+/g, " ").trim(),
    120,
  );
  const nameError = nameTouched || submitted ? crewNameError(draft.name, copy, true) : undefined;
  const modelError =
    (modelsTouched || submitted) && !draft.candidates.length
      ? crewValidationMessage(error, copy, true)
      : undefined;
  const visibleError =
    nameError || modelError
      ? undefined
      : memberValidationFeedback(normalized, copy, {
          name: nameTouched,
          models: modelsTouched,
          dirty: form.dirty || groups !== (initial.groups ?? []).join(", "),
          submitted,
        });
  return (
    <Stack>
      {extraFields}
      <Field
        label={copy("Üye adı", "Member name")}
        value={draft.name}
        error={nameError}
        onBlur={() => setNameTouched(true)}
        editable={!locked}
        onChangeText={(name) => form.patch({ name })}
      />
      <SelectField
        label={copy("Rol", "Role")}
        value={draft.role}
        options={roles}
        disabled={locked}
        onChange={(role) => form.patch({ role })}
      />
      <NavigationRow
        ref={instructionsTrigger}
        label={instructionsLabel}
        detail={instructionsPreview || copy("Talimat ekle", "Add instructions")}
        detailLines={2}
        disabled={locked}
        onPress={() => setEditingInstructions(true)}
      />
      {editingInstructions ? (
        <Sheet
          visible
          size="full"
          scroll={false}
          title={instructionsLabel}
          returnFocusRef={instructionsTrigger}
          onClose={() => setEditingInstructions(false)}
        >
          <Stack
            style={{
              flex: 1,
              width: "100%",
              maxWidth: metrics.contentWidth,
              alignSelf: "center",
              paddingHorizontal: space.screen,
              paddingTop: space.sm,
              paddingBottom: space.lg,
            }}
          >
            <Input
              label={instructionsLabel}
              fill
              multiline
              editable={!locked}
              value={draft.instructions}
              onChangeText={(instructions) => form.patch({ instructions })}
            />
          </Stack>
        </Sheet>
      ) : null}
      {/* The one model selection: the member's first candidate is its fixed (and fallback) model. */}
      <ModelChoiceField
        role="crew.member"
        value={memberChoice(draft)}
        catalog={catalog}
        disabled={locked}
        fallbackOpen={!draft.candidates.length}
        onChange={(choice) => {
          const patch = memberChoicePatch(draft, choice);
          if (!patch) return;
          setModelsTouched(true);
          form.patch(patch);
        }}
        fixed={
          <FixedModelField
            value={memberFixedModel(draft, providers)}
            catalog={catalog}
            providers={providers}
            disabled={locked}
            onChange={(next) => {
              const candidates = withMemberFixedModel(draft.candidates, next);
              if (!candidates) return;
              setModelsTouched(true);
              form.patch({ candidates });
            }}
          />
        }
        fixedFooter={
          <>
            <ErrorText error={modelError} />
            {draft.candidates.length > 1 ? (
              <Body muted>
                {copy(
                  "Kayıtlı {p0} yedek aday korunur.",
                  "{p0} more saved candidates are kept.",
                  { p0: draft.candidates.length - 1 },
                )}
              </Body>
            ) : null}
          </>
        }
      />
      {/* One shared status line per catalog state; existing model settings are always kept. */}
      {catalogState === "loading" || catalogState === "empty" || catalogState === "error" ? (
        <StatusLine
          tone={catalogState === "error" ? "warning" : "neutral"}
          busy={catalogState === "loading"}
          label={
            catalogState === "loading"
              ? copy("Model kataloğu yükleniyor. Var olan model ayarları korunur.", "Loading the model catalog. Existing model settings are retained.")
              : catalogState === "empty"
                ? copy("Bu bilgisayar kullanılabilir model bildirmedi. Var olan model ayarları korunur.", "This computer reported no available models. Existing model settings are retained.")
                : copy("Model kataloğu yüklenemedi. Var olan model ayarları korunur.", "The model catalog is unavailable. Existing model settings are retained.")
          }
          action={
            catalogState === "error" && catalogRead?.retry
              ? { label: copy("Yeniden dene", "Retry"), onPress: catalogRead.retry }
              : undefined
          }
        />
      ) : null}
      <Disclosure label={copy("Gelişmiş", "Advanced")}>
        {groupsSupported && (
          <Field
            label={copy("Uzmanlık grupları", "Specialty groups")}
            hint={copy("Virgülle ayırın", "Separate with commas")}
            value={groups}
            editable={!locked}
            onChangeText={setGroups}
          />
        )}
        {lookSupported ? (
          <Section title={copy("Kimlik ve görünüm", "Identity and look")}>
            <MemberLookFields member={draft} disabled={locked} onPatch={form.patch} />
          </Section>
        ) : null}

        {/* The first candidate's effort is in the model picker; older extra candidates keep theirs here. */}
        {(draft.selection === "fixed" ? [] : draft.candidates.slice(1)).map(
          (item) => (
            <Stack key={item.id}>
              <Heading>
                {models.find((model) => model.harness === item.harness && model.id === item.model)
                  ?.name || item.model}
              </Heading>
              {(
                models.find((model) => model.harness === item.harness && model.id === item.model)
                  ?.settings ?? []
              ).map((setting) => (
                <SelectField
                  key={setting.id}
                  label={settingText(settingLabel(setting))}
                  value={item.modelSettings[setting.id] ?? setting.value}
                  options={setting.options.map((option) => ({
                    ...option,
                    label: settingText(option.label),
                  }))}
                  disabled={locked}
                  onChange={(value) =>
                    changeCandidate(item.id, {
                      modelSettings: { ...item.modelSettings, [setting.id]: value },
                    })
                  }
                />
              ))}
            </Stack>
          ),
        )}
      </Disclosure>
      <ErrorText error={visibleError} />
      <FormActions
        feedback={
          <>
            {feedback}
            {!busy && blockedReason ? <Body muted>{blockedReason}</Body> : null}
          </>
        }
        submitLabel={copy("Kaydet", "Save")}
        busy={busy}
        disabled={locked || !!error}
        onSubmit={() => {
          setSubmitted(true);
          if (!locked && !error) onSave(normalized);
        }}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={requestClose}
        cancelDisabled={busy}
      />
      {endAction}
    </Stack>
  );
}
