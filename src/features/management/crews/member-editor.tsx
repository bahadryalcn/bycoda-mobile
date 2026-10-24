import { useState } from "react";
import type { ReactNode } from "react";
import type { HostModelCatalog } from "@/domain/types";
import type { CrewAgent, CrewCandidate } from "@/remote/contracts/crews";
import { useFormDraft } from "@/state/form-draft";
import { useCopy } from "@/ui/copy";
import { crewRoleOptions, crewCatalogState, type CrewCatalogRead } from "./presentation";
import {
  Body,
  Button,
  Disclosure,
  ErrorText,
  Field,
  FormActions,
  Heading,
  MultiSelectField,
  SelectField,
  Stack,
} from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import { candidateFromCatalog, memberValidation } from "./model";

export function useRoleOptions() {
  const copy = useCopy();
  return crewRoleOptions(copy);
}

export function MemberEditor({
  initial,
  catalog,
  catalogRead,
  groupsSupported,
  busy,
  disabled,
  feedback,
  extraFields,
  extraDirty,
  onSave,
  onClose,
}: {
  initial: CrewAgent;
  catalog?: HostModelCatalog;
  catalogRead?: CrewCatalogRead;
  groupsSupported: boolean;
  busy: boolean;
  disabled?: boolean;
  feedback?: ReactNode;
  extraFields?: ReactNode;
  extraDirty?: boolean;
  onSave: (member: CrewAgent) => void;
  onClose: () => void;
}) {
  const copy = useCopy();
  const form = useFormDraft(() => structuredClone(initial));
  const draft = form.values;
  const locked = busy || disabled;
  const [groups, setGroups] = useState((initial.groups ?? []).join(", "));
  const { requestClose } = useSheetGuard({
    dirty: form.dirty || extraDirty || groups !== (initial.groups ?? []).join(", "),
    pending: busy,
    onClose,
  });
  const roles = useRoleOptions();
  const models = Object.values(catalog?.models ?? {}).flatMap((rows) => rows ?? []);
  const catalogState = catalogRead?.state ?? crewCatalogState(catalog, null);
  const options = new Map(
    models.map((model) => [
      `${model.harness}/${model.id}`,
      { value: `${model.harness}/${model.id}`, label: model.name, detail: model.harness },
    ]),
  );
  for (const candidate of draft.candidates)
    if (!options.has(candidate.id))
      options.set(candidate.id, {
        value: candidate.id,
        label: candidate.model,
        detail: candidate.harness,
      });
  const candidate = (id: string) =>
    draft.candidates.find((item) => item.id === id) ??
    (catalog && candidateFromCatalog(catalog, id));
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
  return (
    <Stack>
      {extraFields}
      <Field
        label={copy("Üye adı", "Member name")}
        value={draft.name}
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
      <Field
        label={copy("Talimatlar", "Instructions")}
        value={draft.instructions}
        multiline
        editable={!locked}
        onChangeText={(instructions) => form.patch({ instructions })}
      />
      {groupsSupported && (
        <Field
          label={copy("Uzmanlık grupları (virgülle ayırın)", "Specialty groups (comma separated)")}
          value={groups}
          editable={!locked}
          onChangeText={setGroups}
        />
      )}
      <SelectField
        label={copy("Model seçimi", "Model selection")}
        value={draft.selection}
        disabled={locked}
        options={[
          { value: "fixed", label: copy("Sabit model", "Fixed model") },
          { value: "automatic", label: copy("Otomatik seçim", "Automatic selection") },
        ]}
        onChange={(selection) => form.patch({ selection })}
      />
      {draft.selection === "fixed" ? (
        <SelectField
          searchable
          label={copy("Model", "Model")}
          value={draft.candidates[0]?.id}
          options={[...options.values()]}
          disabled={locked}
          onChange={(id) => {
            const next = candidate(id);
            if (next)
              form.patch({
                candidates: [next, ...draft.candidates.filter((row) => row.id !== id)],
              });
          }}
        />
      ) : (
        <MultiSelectField
          searchable
          label={copy("İzin verilen modeller", "Allowed models")}
          values={draft.candidates.map((row) => row.id)}
          options={[...options.values()]}
          max={20}
          disabled={locked}
          onChange={(ids) =>
            form.patch({
              candidates: ids.flatMap((id) => {
                const next = candidate(id);
                return next ? [next] : [];
              }),
            })
          }
        />
      )}
      {catalogState === "loading" ? (
        <Body muted>
          {copy(
            "Model kataloğu yükleniyor. Var olan model ayarları korunur.",
            "Loading the model catalog. Existing model settings are retained.",
          )}
        </Body>
      ) : null}
      {catalogState === "empty" ? (
        <Body muted>
          {copy(
            "Bu bilgisayar kullanılabilir model bildirmedi. Var olan model ayarları korunur.",
            "This computer reported no available models. Existing model settings are retained.",
          )}
        </Body>
      ) : null}
      {catalogState === "error" ? (
        <>
          <Body muted>
            {copy(
              "Model kataloğu yüklenemedi. Var olan model ayarları korunur.",
              "The model catalog is unavailable. Existing model settings are retained.",
            )}
          </Body>
          {catalogRead?.retry ? (
            <Button
              tone="quiet"
              label={copy("Model kataloğunu yeniden yükle", "Retry model catalog")}
              onPress={catalogRead.retry}
            />
          ) : null}
        </>
      ) : null}
      <Disclosure label={copy("Model ayarları ve tahminler", "Model settings and estimates")}>
        {(draft.selection === "fixed" ? draft.candidates.slice(0, 1) : draft.candidates).map(
          (item) => (
            <Stack key={item.id}>
              <Heading>{item.model}</Heading>
              {(
                models.find((model) => model.harness === item.harness && model.id === item.model)
                  ?.settings ?? []
              ).map((setting) => (
                <SelectField
                  key={setting.id}
                  label={setting.label}
                  value={item.modelSettings[setting.id] ?? setting.value}
                  options={setting.options}
                  disabled={locked}
                  onChange={(value) =>
                    changeCandidate(item.id, {
                      modelSettings: { ...item.modelSettings, [setting.id]: value },
                    })
                  }
                />
              ))}
              <EstimateFields
                key={item.id}
                candidate={item}
                busy={!!locked}
                onChange={(patch) => changeCandidate(item.id, patch)}
              />
            </Stack>
          ),
        )}
        <Body muted>
          {copy(
            "Maliyet ve kalite değerleri sahibin tahminidir; gerçek fatura veya ölçüm değildir.",
            "Cost and quality values are owner estimates, not billing or measured benchmarks.",
          )}
        </Body>
      </Disclosure>
      <ErrorText error={error} />
      <FormActions
        feedback={feedback}
        submitLabel={copy("Kaydet", "Save")}
        busy={busy}
        disabled={locked || !!error}
        onSubmit={() => {
          if (!locked && !error) onSave(normalized);
        }}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={requestClose}
        cancelDisabled={busy}
      />
    </Stack>
  );
}

function EstimateFields({
  candidate,
  busy,
  onChange,
}: {
  candidate: CrewCandidate;
  busy: boolean;
  onChange: (patch: Partial<CrewCandidate>) => void;
}) {
  const copy = useCopy();
  const [values, setValues] = useState({
    cost: candidate.cost === undefined ? "" : String(candidate.cost),
    quality: candidate.quality === undefined ? "" : String(candidate.quality),
  });
  const fields = [
    ["cost", copy("Tahmini maliyet (isteğe bağlı)", "Estimated cost (optional)"), 1_000_000],
    [
      "quality",
      copy("Tahmini kalite (0–100, isteğe bağlı)", "Estimated quality (0–100, optional)"),
      100,
    ],
  ] as const;
  return (
    <>
      {fields.map(([key, label, max]) => (
        <Field
          key={key}
          label={label}
          value={values[key]}
          editable={!busy}
          keyboardType="decimal-pad"
          onChangeText={(text) => {
            setValues((current) => ({ ...current, [key]: text }));
            if (text === "") onChange({ [key]: undefined });
            else
              onChange({
                [key]: /^\d+(\.\d*)?$/.test(text) && Number(text) <= max ? Number(text) : NaN,
              });
          }}
        />
      ))}
    </>
  );
}
