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
import { HintSection } from "@/ui/info-hint";
import { confirmAction } from "@/ui/confirm";
import { IntegerTextStepper } from "@/ui/limit-presets";
import { NumberField } from "@/ui/number-field";
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
import {
  copyLibraryMember,
  crewMemberPresentation,
  crewNameError,
  crewValidation,
  crewValidationMessage,
  memberValidation,
  newMember,
} from "./model";
import { MemberEditor, useRoleOptions } from "./member-editor";
import { handleLabel, linkState, rosterTraits } from "./identity-model";
import { MemberAvatar } from "./member-avatar";
import type { CrewCatalogRead } from "./presentation";

const numericPolicy = ["maxParallel", "maxAssignments", "maxRunMinutes"] as const;
type NumericPolicy = (typeof numericPolicy)[number];

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
  const lookSupported = machine?.capabilities?.includes("crews.identity.v1") === true;
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
  const [adding, setAdding] = useState(false);
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
  const traits = rosterTraits(draft.agents);
  const invalidMember = draft.agents.some((agent) => !!memberValidation(agent));
  const visibleError =
    invalidNumbers && (submitted || changedNumbers)
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
  const blockedReason = !supported
    ? copy("Bu bilgisayarda düzenleme kullanılamıyor.", "Editing is unavailable on this computer.")
    : (crewNameError(draft.name, copy) ??
      (invalidMember
        ? copy(
            "Her üyenin adını, rolünü ve modelini kontrol edin.",
            "Check each member’s name, role, and model.",
          )
        : invalidNumbers
          ? error
          : crewValidationMessage(error, copy)));
  const labels: Record<NumericPolicy, string> = {
    maxParallel: copy("Eşzamanlı görevler (1–4)", "Parallel tasks (1–4)"),
    maxAssignments: copy("Görev sayısı sınırı (1–20)", "Assignment limit (1–20)"),
    maxRunMinutes: copy("Süre sınırı (dakika, 1–240)", "Run limit (minutes, 1–240)"),
  };
  return (
    <Stack>
      <Field
        label={copy("Ekip adı", "Crew name")}
        placeholder={copy("Örn. Ürün ekibi", "e.g. Product team")}
        value={draft.name}
        error={nameTouched || submitted ? crewNameError(draft.name, copy) : undefined}
        onBlur={() => setNameTouched(true)}
        editable={!busy && supported}
        onChangeText={(name) => form.patch({ name })}
      />
      {opening.updatedAt ? (
        <Body muted>
          {draft.projectId
            ? copy("Kapsam: Bu proje", "Scope: This project")
            : copy(
                "Kapsam: Bu bilgisayardaki tüm projeler",
                "Scope: All projects on this computer",
              )}
        </Body>
      ) : (
        <SelectField
          label={copy("Kapsam", "Scope")}
          value={draft.projectId ? "project" : "host"}
          disabled={busy || !supported}
          options={[
            { value: "project", label: copy("Bu proje", "This project") },
            {
              value: "host",
              label: copy("Bu bilgisayardaki tüm projeler", "All projects on this computer"),
            },
          ]}
          onChange={(scope) =>
            form.patch({ projectId: scope === "project" ? projectId : undefined })
          }
        />
      )}
      <HintSection
        presentation="visible"
        title={copy("Üyeler", "Members")}
        help={copy(
          "Bir koordinatör, bir inceleyen ve en az bir uzman ekleyin. Kaydetmek işi başlatmaz.",
          "Include one coordinator, one reviewer and at least one specialist. Saving does not start work.",
        )}
      >
        <NavigationGroup>
          {draft.agents.map((agent) => {
            const link = linkState(agent, directory.agents);
            const presentation = crewMemberPresentation(
              agent,
              roles.find((role) => role.value === agent.role)!.label,
              copy,
              submitted || interactedMembers.has(agent.id),
            );
            return (
              <NavigationRow
                key={agent.id}
                label={presentation.label}
                icon={<MemberAvatar member={agent} traits={traits.get(agent.id)} />}
                detail={
                  presentation.error
                    ? presentation.detail
                    : [
                        handleLabel(agent.handle),
                        presentation.detail,
                        link === "linked" ? copy("Kütüphane", "Library") : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                }
                detailLines={2}
                tone={presentation.error ? "danger" : undefined}
                disabled={busy || !supported}
                onPress={() => setMember(structuredClone(agent))}
              />
            );
          })}
        </NavigationGroup>
        {/* One "Add member" path: a new member, or a copy of a saved library member. */}
        <Button
          tone="quiet"
          label={copy("Üye ekle", "Add member")}
          disabled={busy || !supported || draft.agents.length >= 20}
          onPress={() =>
            directory.agents.length > 0
              ? setAdding(true)
              : setMember(newMember(identifier(), "specialist", ""))
          }
        />
      </HintSection>
      <Sheet
        visible={adding}
        size="compact"
        title={copy("Üye ekle", "Add member")}
        onClose={() => setAdding(false)}
      >
        <NavigationGroup>
          <NavigationRow
            label={copy("Yeni üye", "New member")}
            disabled={busy || !supported || draft.agents.length >= 20}
            onPress={() => {
              setAdding(false);
              setMember(newMember(identifier(), "specialist", ""));
            }}
          />
        </NavigationGroup>
        <SelectField
          searchable
          label={copy("Kütüphaneden ekle", "Add from library")}
          placeholder={copy("Kayıtlı üye seç", "Choose a saved member")}
          value=""
          disabled={busy || !supported || draft.agents.length >= 20}
          options={directory.agents.map((profile) => ({
            value: profile.id,
            label: profile.name,
            detail: profile.projectId
              ? copy("Bu proje", "This project")
              : copy("Bilgisayar geneli", "Host-wide"),
          }))}
          onChange={(profileId) => {
            const profile = directory.agents.find((item) => item.id === profileId);
            if (!profile || draft.agents.length >= 20) return;
            form.patch({
              agents: [...draft.agents, copyLibraryMember(profile, identifier(), groupsSupported)],
            });
            setAdding(false);
          }}
        />
      </Sheet>
      <Disclosure label={copy("Gelişmiş", "Advanced")}>
        {numericPolicy.map((key) => {
          const max = key === "maxParallel" ? 4 : key === "maxAssignments" ? 20 : 240;
          const value = numbers[key];
          const number = Number(value);
          const onChangeText = (text: string) =>
            setNumbers((current) => ({ ...current, [key]: text }));
          // Older crews can have a fractional time limit; retain the supported precision.
          return key === "maxRunMinutes" && !Number.isInteger(number) ? (
            <NumberField
              key={key}
              label={labels[key]}
              value={value}
              decimal
              editable={!busy && supported}
              onChangeText={onChangeText}
            />
          ) : (
            <IntegerTextStepper
              key={key}
              label={labels[key]}
              value={value}
              min={1}
              max={max}
              disabled={busy || !supported}
              onChangeText={onChangeText}
            />
          );
        })}
        <NavigationGroup>
          <ToggleField
            label={copy("Alt ajanlara izin ver", "Allow subagents")}
            detail={copy(
              "Üyeler işin parçalarını başka ajanlara verebilir.",
              "Members can delegate parts of their work to other agents.",
            )}
            value={draft.policy.allowSubagents}
            disabled={busy || !supported}
            onChange={(allowSubagents) =>
              form.patch({ policy: { ...draft.policy, allowSubagents } })
            }
          />
          <ToggleField
            label={copy(
              "Üye onaylarını koordinatöre devret",
              "Delegate member approvals to coordinator",
            )}
            detail={copy(
              "Üyelerin izin isteklerini koordinatör yanıtlar.",
              "The coordinator answers members’ approval requests.",
            )}
            value={draft.policy.delegateApprovals === true}
            disabled={busy || !supported}
            onChange={(delegateApprovals) =>
              form.patch({ policy: { ...draft.policy, delegateApprovals } })
            }
          />
        </NavigationGroup>
      </Disclosure>
      <ErrorText error={visibleError} />
      <FormActions
        feedback={
          <>
            <MutationState mutation={save} />
            {!busy && blockedReason ? <Body muted>{blockedReason}</Body> : null}
          </>
        }
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
        <Sheet visible size="form" title={copy("Ekip üyesi", "Crew member")} onClose={closeMember}>
          <MemberEditor
            key={member.id}
            initial={member}
            catalog={catalog}
            catalogRead={catalogRead}
            groupsSupported={groupsSupported}
            lookSupported={lookSupported}
            busy={busy}
            disabled={!supported}
            onClose={closeMember}
            endAction={
              draft.agents.some((item) => item.id === member.id) ? (
                <NavigationRow
                  intent="command"
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
                        form.patch({
                          agents: draft.agents.filter((item) => item.id !== member.id),
                        });
                        setMember(null);
                      },
                    )
                  }
                />
              ) : undefined
            }
            onSave={(edited) => {
              form.patch({
                agents: draft.agents.some((item) => item.id === edited.id)
                  ? draft.agents.map((item) => (item.id === edited.id ? edited : item))
                  : [...draft.agents, edited],
              });
              closeMember();
            }}
          />
        </Sheet>
      )}
    </Stack>
  );
}
