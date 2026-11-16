import { agentPresentation } from "../shared/agent-presentation";
import { useState } from "react";
import type { ReactNode } from "react";
import type { HostModelCatalog } from "@/domain/types";
import type { CrewAgent, CrewCandidate } from "@/remote/contracts/crews";
import { useFormDraft } from "@/state/form-draft";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { ModelRoutingGetResultSchema, type ModelRoutingState } from "../../../../../src/shared/model/host-contracts/model-routing";
import { modelRoutingPoolEntryIds } from "../../../../../src/shared/model/modelRoutingPools";
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
  Notice,
  Section,
  SelectField,
  Stack,
} from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import { MemberLookFields } from "./member-look-fields";
import { candidateFromCatalog, crewNameError, crewValidationMessage, memberValidation, memberValidationFeedback, memberRoutingPatch } from "./model";

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
  onSave: (member: CrewAgent) => void;
  onClose: () => void;
}) {
  const copy = useCopy();
  const form = useFormDraft(() => structuredClone(initial));
  const draft = form.values;
  const locked = busy || disabled;
  const machine = useActiveMachine();
  const [openingMachineId] = useState(machine?.id);
  const routingSupported = machine?.id === openingMachineId && machine?.capabilities?.includes("models.routing.v1") === true;
  const routing = useHostQuery<ModelRoutingState>(["modelRouting"], "modelRouting.get", {}, { enabled: routingSupported,
    queryFn: async (client, signal) => ModelRoutingGetResultSchema.parse(await client.request("modelRouting.get", {}, { signal })).state });
  const routingState = machine?.id === openingMachineId ? routing.data : undefined;
  const binding = draft.selection === "fixed" ? "fixed" : draft.modelChoice?.kind === "pool" ? `pool:${draft.modelChoice.poolId}` : draft.modelChoice?.kind === "default" ? "default" : draft.modelChoice?.kind === "order" ? "order" : "legacy";
  const roleBinding = routingState?.roles["crew.member"] ?? { kind: "order" as const };
  const effective = binding === "default" ? roleBinding : draft.modelChoice;
  const activePool = effective?.kind === "pool" ? routingState?.pools.find(pool => pool.id === effective.poolId) : undefined;
  const boundPoolId = draft.modelChoice?.kind === "pool" ? draft.modelChoice.poolId : undefined;
  const poolMissing = boundPoolId !== undefined && !routingState?.pools.some(pool => pool.id === boundPoolId);
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
  const options = new Map(
    models.map((model) => [
      `${model.harness}/${model.id}`,
      { value: `${model.harness}/${model.id}`, label: model.name, detail: agentPresentation(model.harness, "") },
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
  const nameError = nameTouched || submitted ? crewNameError(draft.name, copy, true) : undefined;
  const modelError = (modelsTouched || submitted) && !draft.candidates.length
    ? crewValidationMessage(error, copy, true) : undefined;
  const visibleError = nameError || modelError ? undefined : memberValidationFeedback(normalized, copy, {
    name: nameTouched, models: modelsTouched,
    dirty: form.dirty || groups !== (initial.groups ?? []).join(", "), submitted,
  });
  return (
    <Stack>
      {extraFields}
      <Section title={copy("Üye", "Member")}>
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
      <Field
        label={copy("Talimatlar", "Instructions")}
        value={draft.instructions}
        multiline
        editable={!locked}
        onChangeText={(instructions) => form.patch({ instructions })}
      />
      {groupsSupported && (
        <Field
          label={copy("Uzmanlık grupları", "Specialty groups")}
          hint={copy("Virgülle ayırın", "Separate with commas")}
          value={groups}
          editable={!locked}
          onChangeText={setGroups}
        />
      )}
      </Section>
      {lookSupported ? (
        <Section title={copy("Kimlik ve görünüm", "Identity and look")}>
          <MemberLookFields member={draft} disabled={locked} onPatch={form.patch} />
        </Section>
      ) : null}
      <Section title={copy("Model", "Model")}>
      <SelectField
        label={copy("Model kaynağı", "Model source")}
        hint={copy("Otomatik seçim, bu üyenin aday listesinden bağımsız olarak bilgisayar sırası veya havuzundan uygun modeli seçebilir. Aşağıdaki adaylar bir izin filtresi değildir.", "Automatic routing can choose an eligible model from Host order or pool outside this member's candidate list. Candidates below are not an allowed-model filter.")}
        value={binding}
        disabled={locked || !routingSupported}
        options={[
          { value: "fixed", label: copy("Sabit model", "Fixed model") },
          { value: "default", label: copy("Crew üyesi rolünü izle", "Follow crew member role") },
          { value: "order", label: copy("Bilgisayar model sırası", "Host model order") },
          ...(binding === "legacy" ? [{ value: "legacy", label: copy("Mevcut aday ayarı", "Existing candidate setting") }] : []),
          ...(routingState?.pools ?? []).map(pool => ({ value: `pool:${pool.id}`, label: pool.name })),
          ...(poolMissing && draft.modelChoice?.kind === "pool" ? [{ value: `pool:${draft.modelChoice.poolId}`, label: copy("Havuz henüz doğrulanmadı: {p0}", "Pool not yet verified: {p0}", { p0: draft.modelChoice.poolId }) }] : []),
        ]}
        onChange={value => {
          if (value === "legacy") return;
          setModelsTouched(true);
          form.patch(memberRoutingPatch(value.startsWith("pool:") ? { kind: "pool", poolId: value.slice(5) } : { kind: value as "fixed" | "default" | "order" }));
        }}
      />
      {binding !== "fixed" && binding !== "legacy" ? <>
        {routingState ? <Body muted>{copy("Geçerli kaynak", "Current source")}: {effective?.kind === "pool" ? activePool?.name ?? (effective.poolId) : binding === "default" && roleBinding.kind === "fixed" ? agentPresentation(roleBinding.target.harness, roleBinding.target.model) : copy("Bilgisayar model sırası", "Host model order")}
          {effective?.kind === "pool" && activePool ? ` · ${modelRoutingPoolEntryIds(routingState.pools, activePool.id).length}` : effective?.kind === "order" ? ` · ${routingState.entries.length}` : ""}</Body> : <Notice message={routing.isError ? copy("Model kaynağı okunamadı. Kayıtlı bağlantı korunur.", "Model source could not be read. Saved binding is preserved.") : copy("Model kaynağı henüz doğrulanmadı. Kayıtlı bağlantı korunur.", "Model source is not yet verified. Saved binding is preserved.")} />}
        {routing.isError ? <Button label={copy("Model kaynağını yeniden oku", "Reload model source")} tone="quiet" onPress={() => { void routing.refetch().catch(() => {}); }} /> : null}
      </> : null}
      {draft.selection === "fixed" ? (
        <SelectField
          searchable
          label={copy("Model", "Model")}
          value={draft.candidates[0]?.id}
          error={modelError}
          hint={!draft.candidates.length ? copy("Bu üyeye bir model seçin.", "Choose a model for this member.") : undefined}
          options={[...options.values()]}
          disabled={locked}
          onChange={(id) => {
            setModelsTouched(true);
            const next = candidate(id);
            if (next)
              form.patch({
                candidates: [next],
                ...memberRoutingPatch({ kind: "fixed" }),
              });
          }}
        />
      ) : (
        <MultiSelectField
          searchable
          label={copy("Kayıtlı yedek adaylar", "Saved fallback candidates")}
          values={draft.candidates.map((row) => row.id)}
          error={modelError}
          hint={copy("İlk aday sabit/yedek modeldir. Bu liste bilgisayar sırasını veya havuzunu sınırlamaz.", "First candidate is the fixed/fallback model. This list does not restrict Host order or pool.")}
          options={[...options.values()]}
          max={20}
          disabled={locked}
          onChange={(ids) => {
            setModelsTouched(true);
            form.patch({
              candidates: ids.flatMap((id) => {
                const next = candidate(id);
                return next ? [next] : [];
              }),
            });
          }}
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
      </Section>
      <Disclosure label={draft.selection === "fixed" ? copy("Model ayarları", "Model settings") : copy("Yedek model ayarları", "Fallback model settings")}>
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
            </Stack>
          ),
        )}
      </Disclosure>
      <ErrorText error={visibleError} />
      <FormActions
        feedback={feedback}
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
    </Stack>
  );
}
