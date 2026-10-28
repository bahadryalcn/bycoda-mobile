import { useRef, useState } from "react";
import type {
  CrewAgent,
  CrewDefinition,
  CrewDirectory,
  CrewPolicy,
} from "@/remote/contracts/crews";
import type { HostModelCatalog } from "@/domain/types";
import { useFormDraft } from "@/state/form-draft";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import {
  Body,
  Button,
  Disclosure,
  ErrorText,
  Field,
  FormActions,
  MutationState,
  NavigationGroup,
  NavigationRow,
  SelectField,
  Sheet,
  Stack,
  ToggleField,
} from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import { identifier } from "../shared/format";
import { copyLibraryMember, crewMemberPresentation, crewNameError, crewValidation, crewValidationMessage, memberValidation, newMember } from "./model";
import { MemberEditor, useRoleOptions } from "./member-editor";
import type { CrewCatalogRead } from "./presentation";

type NumericPolicy =
  | "maxParallel"
  | "maxAssignments"
  | "maxRunMinutes"
  | "maxEstimatedCost"
  | "minimumQuality"
  | "costWeight"
  | "qualityWeight";
const numericPolicy: NumericPolicy[] = [
  "maxParallel",
  "maxAssignments",
  "maxRunMinutes",
  "maxEstimatedCost",
  "minimumQuality",
  "costWeight",
  "qualityWeight",
];

export function CrewEditor({
  initial,
  projectId,
  directory,
  catalog,
  catalogRead,
  onClose,
}: {
  initial: CrewDefinition;
  projectId: string;
  directory: CrewDirectory;
  catalog?: HostModelCatalog;
  catalogRead?: CrewCatalogRead;
  onClose: () => void;
}) {
  const copy = useCopy();
  const [opening] = useState(() => structuredClone(initial));
  const machine = useActiveMachine();
  const [machineId] = useState(machine?.id);
  const supported =
    machine?.id === machineId && machine?.capabilities?.includes("crews.v1") === true;
  const groupsSupported = machine?.capabilities?.includes("crews.agent-groups.v1") === true;
  const form = useFormDraft(() => structuredClone(opening));
  const draft = form.values;
  const [numbers, setNumbers] = useState(
    () =>
      Object.fromEntries(
        numericPolicy.map((key) => [
          key,
          opening.policy[key] === undefined ? "" : String(opening.policy[key]),
        ]),
      ) as Record<NumericPolicy, string>,
  );
  const [member, setMember] = useState<CrewAgent | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [interactedMembers, setInteractedMembers] = useState<ReadonlySet<string>>(() => new Set());
  const closeMember = () => {
    if (member) setInteractedMembers((current) => new Set([...current, member.id]));
    setMember(null);
  };
  const [profileId, setProfileId] = useState("");
  const save = useHostMutation<CrewDefinition>("crews.save", ["crews", projectId]);
  const sending = useRef(false);
  const busy = save.isPending;
  const changedNumbers = numericPolicy.some(
    (key) =>
      numbers[key] !== (opening.policy[key] === undefined ? "" : String(opening.policy[key])),
  );
  const { requestClose } = useSheetGuard({
    dirty: form.dirty || changedNumbers,
    pending: busy,
    onClose,
  });
  const roles = useRoleOptions();
  const policy = {
    ...draft.policy,
    ...Object.fromEntries(
      numericPolicy.map((key) => [key, numbers[key] === "" ? undefined : Number(numbers[key])]),
    ),
  } as CrewPolicy;
  const normalized = { ...draft, policy };
  const invalidNumbers = numericPolicy.some(
    (key) => numbers[key] !== "" && !/^\d+(\.\d+)?$/.test(numbers[key]),
  );
  const error = invalidNumbers
    ? copy("Geçerli sayısal sınırlar girin.", "Enter valid numeric limits.")
    : crewValidation(normalized);
  const invalidMember = draft.agents.some((agent) => !!memberValidation(agent));
  const visibleError = invalidNumbers && (submitted || changedNumbers)
    ? error
    : (submitted || changedNumbers || form.dirty) && !invalidMember
      ? crewValidationMessage(error, copy)
      : undefined;
  const submit = () => {
    setSubmitted(true);
    if (
      !supported ||
      sending.current ||
      error ||
      member ||
      useMachines.getState().activeId !== machineId
    )
      return;
    sending.current = true;
    save.mutate(
      { projectId, definition: normalized, expectedUpdatedAt: opening.updatedAt || undefined },
      {
        onSuccess: onClose,
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  };
  const labels: Record<NumericPolicy, string> = {
    maxParallel: copy("Eşzamanlı görevler (1–4)", "Parallel tasks (1–4)"),
    maxAssignments: copy("Görev sayısı sınırı (1–20)", "Assignment limit (1–20)"),
    maxRunMinutes: copy("Süre sınırı (dakika, 1–240)", "Run limit (minutes, 1–240)"),
    maxEstimatedCost: copy(
      "Tahmini maliyet sınırı (isteğe bağlı)",
      "Estimated cost limit (optional)",
    ),
    minimumQuality: copy(
      "Asgari kalite (0–100, isteğe bağlı)",
      "Minimum quality (0–100, optional)",
    ),
    costWeight: copy("Maliyet ağırlığı (0–1, isteğe bağlı)", "Cost weight (0–1, optional)"),
    qualityWeight: copy("Kalite ağırlığı (0–1, isteğe bağlı)", "Quality weight (0–1, optional)"),
  };
  return (
    <Stack>
      <Field
        label={copy("Ekip adı", "Crew name")}
        value={draft.name}
        error={nameTouched || submitted ? crewNameError(draft.name, copy) : undefined}
        onBlur={() => setNameTouched(true)}
        editable={!busy && supported}
        onChangeText={(name) => form.patch({ name })}
      />
      <SelectField
        label={copy("Kapsam", "Scope")}
        value={draft.projectId ? "project" : "host"}
        disabled={busy || !supported || !!opening.updatedAt}
        options={[
          { value: "project", label: copy("Bu proje", "This project") },
          {
            value: "host",
            label: copy("Bu bilgisayardaki tüm projeler", "All projects on this computer"),
          },
        ]}
        onChange={(scope) => form.patch({ projectId: scope === "project" ? projectId : undefined })}
      />
      <Body muted>
        {copy(
          "Bir koordinatör, bir inceleyen ve en az bir uzman ekleyin. Kaydetmek işi başlatmaz.",
          "Include one coordinator, one reviewer and at least one specialist. Saving does not start work.",
        )}
      </Body>
      <NavigationGroup>
        {draft.agents.map((agent) => {
          const presentation = crewMemberPresentation(agent,
            roles.find((role) => role.value === agent.role)!.label, copy,
            submitted || interactedMembers.has(agent.id));
          return <NavigationRow
            key={agent.id}
            label={presentation.label}
            detail={presentation.detail}
            detailLines={2}
            tone={presentation.error ? "danger" : undefined}
            disabled={busy || !supported}
            onPress={() => setMember(structuredClone(agent))}
          />;
        })}
      </NavigationGroup>
      <Button
        tone="quiet"
        label={copy("Üye ekle", "Add member")}
        disabled={busy || !supported || draft.agents.length >= 20}
        onPress={() => setMember(newMember(identifier(), "specialist", ""))}
      />
      {directory.agents.length > 0 && (
        <Disclosure label={copy("Kütüphaneden üye ekle", "Add a library member")}>
          <SelectField
            searchable
            label={copy("Kayıtlı üye", "Saved member")}
            value={profileId}
            disabled={busy || !supported}
            options={directory.agents.map((profile) => ({
              value: profile.id,
              label: profile.name,
              detail: profile.projectId
                ? copy("Bu proje", "This project")
                : copy("Bilgisayar geneli", "Host-wide"),
            }))}
            onChange={setProfileId}
          />
          <Button
            tone="quiet"
            label={copy("Ekibe kopyala", "Copy to crew")}
            disabled={busy || !supported || !profileId || draft.agents.length >= 20}
            onPress={() => {
              const profile = directory.agents.find((item) => item.id === profileId);
              if (profile) {
                form.patch({
                  agents: [
                    ...draft.agents,
                    copyLibraryMember(profile, identifier(), groupsSupported),
                  ],
                });
                setProfileId("");
              }
            }}
          />
        </Disclosure>
      )}
      <Disclosure label={copy("Çalışma ilkeleri", "Working policy")}>
        <SelectField
          label={copy("Model seçme yaklaşımı", "Allocation preference")}
          value={draft.policy.preset}
          disabled={busy || !supported}
          options={[
            { value: "economy", label: copy("Ekonomik", "Economy") },
            { value: "balanced", label: copy("Dengeli", "Balanced") },
            { value: "quality", label: copy("Kalite", "Quality") },
          ]}
          onChange={(preset) => form.patch({ policy: { ...draft.policy, preset } })}
        />
        {numericPolicy.map((key) => (
          <Field
            key={key}
            label={labels[key]}
            value={numbers[key]}
            editable={!busy && supported}
            keyboardType="decimal-pad"
            onChangeText={(text) => setNumbers((current) => ({ ...current, [key]: text }))}
          />
        ))}
        <ToggleField
          label={copy("Maliyeti bilinmeyen modellere izin ver", "Allow models with unknown cost")}
          value={draft.policy.allowUnknownCost}
          disabled={busy || !supported}
          onChange={(allowUnknownCost) =>
            form.patch({ policy: { ...draft.policy, allowUnknownCost } })
          }
        />
        <ToggleField
          label={copy("Alt ajanlara izin ver", "Allow subagents")}
          value={draft.policy.allowSubagents}
          disabled={busy || !supported}
          onChange={(allowSubagents) => form.patch({ policy: { ...draft.policy, allowSubagents } })}
        />
        <ToggleField
          label={copy(
            "Üye onaylarını koordinatöre devret",
            "Delegate member approvals to coordinator",
          )}
          value={draft.policy.delegateApprovals === true}
          disabled={busy || !supported}
          onChange={(delegateApprovals) =>
            form.patch({ policy: { ...draft.policy, delegateApprovals } })
          }
        />
      </Disclosure>
      <ErrorText error={visibleError} />
      <FormActions
        feedback={<MutationState mutation={save} />}
        submitLabel={copy("Ekibi kaydet", "Save crew")}
        busy={busy}
        disabled={!supported || busy || !!member || !!error}
        cancelDisabled={busy}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={requestClose}
        onSubmit={() => {
          setSubmitted(true);
          if (error) return;
          if (draft.policy.delegateApprovals && !opening.policy.delegateApprovals)
            confirmAction(
                copy("Onayları devret", "Delegate approvals"),
                copy(
                  "Koordinatör, ekip üyelerinin izin isteklerine sizin yerinize yanıt verebilecek.",
                  "The coordinator will be allowed to answer crew members' approval requests on your behalf.",
                ),
                copy("Onayla", "Approve"),
                submit,
              );
          else submit();
        }}
      />
      {member && (
        <Sheet
          visible
          size="form"
          title={copy("Ekip üyesi", "Crew member")}
          onClose={closeMember}
        >
          <MemberEditor
            key={member.id}
            initial={member}
            catalog={catalog}
            catalogRead={catalogRead}
            groupsSupported={groupsSupported}
            busy={busy}
            disabled={!supported}
            onClose={closeMember}
            onSave={(edited) => {
              form.patch({
                agents: draft.agents.some((item) => item.id === edited.id)
                  ? draft.agents.map((item) => (item.id === edited.id ? edited : item))
                  : [...draft.agents, edited],
              });
              closeMember();
            }}
          />
          {draft.agents.some((item) => item.id === member.id) && (
            <Button
              tone="danger"
              label={copy("Üyeyi ekipten çıkar", "Remove member from crew")}
              disabled={busy || !supported}
              onPress={() =>
                confirmAction(
                  copy("Üyeyi ekipten çıkar", "Remove member from crew"),
                  copy(
                    "Üye bu taslaktan çıkarılacak. Kütüphane kaydı korunur.",
                    "The member will be removed from this draft. Its library profile is kept.",
                  ),
                  copy("Çıkar", "Remove"),
                  () => {
                    form.patch({ agents: draft.agents.filter((item) => item.id !== member.id) });
                    setMember(null);
                  },
                )
              }
            />
          )}
        </Sheet>
      )}
    </Stack>
  );
}
