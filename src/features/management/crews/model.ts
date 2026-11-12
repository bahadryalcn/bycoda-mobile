import { defaultCrewPolicy, parseCrewAgent, parseCrewDefinition } from "../../../../../src/features/crews/model/crew";
import type { CrewAgent, CrewDefinition, CrewDirectory, CrewRole, SavedCrewAgent } from "@/remote/contracts/crews";
import type { HostModelCatalog } from "@/domain/types";
import type { CrewCopy } from "./presentation";

export function newMember(id: string, role: CrewRole, name: string): CrewAgent {
  return { id, role, name, instructions: "", selection: "fixed", candidates: [] };
}
export function newDefinition(id: string, projectId: string): CrewDefinition {
  return { id, name: "", projectId, updatedAt: 0, policy: { ...defaultCrewPolicy },
    agents: [newMember(`${id}-lead`, "coordinator", ""), newMember(`${id}-worker`, "specialist", ""), newMember(`${id}-review`, "reviewer", "")] };
}
export function copyLibraryMember(profile: SavedCrewAgent, id: string, groupsSupported: boolean): CrewAgent {
  const { projectId: _projectId, updatedAt, ...member } = structuredClone(profile);
  return { ...member, id, ...(groupsSupported ? { source: { id: profile.id, updatedAt } } : { groups: undefined, source: undefined }) };
}
export function candidateFromCatalog(catalog: HostModelCatalog, key: string) {
  const model = Object.values(catalog.models).flatMap((rows) => rows ?? []).find((row) => `${row.harness}/${row.id}` === key);
  return model ? { id: key, harness: model.harness, model: model.id,
    modelSettings: Object.fromEntries((model.settings ?? []).map((setting) => [setting.id, setting.value])), capabilities: {} } : undefined;
}
export function crewValidation(value: CrewDefinition): string | undefined {
  try { parseCrewDefinition(value); return undefined; } catch (error) { return error instanceof Error ? error.message : "Invalid crew"; }
}
export function memberValidation(value: CrewAgent): string | undefined {
  try { parseCrewAgent(value); return undefined; } catch (error) { return error instanceof Error ? error.message : "Invalid crew member"; }
}

/** Presentation only: the canonical parser above still decides whether saving is valid. */
export function crewValidationMessage(error: string | undefined, copy: CrewCopy, member = false): string | undefined {
  if (!error) return undefined;
  switch (error) {
    case "Choose at least one model per member":
      return member
        ? copy("Bu üyeye en az bir model seçin.", "Choose at least one model for this member.")
        : copy("Her üyeye en az bir model seçin.", "Choose at least one model for every member.");
    case "Choose 3 to 20 crew members, including a coordinator and reviewer":
      return copy("Bir koordinatör, bir inceleyen ve en az bir uzman olacak şekilde 3–20 üye seçin.", "Choose 3–20 members, including one coordinator, one reviewer and a specialist.");
    case "A crew needs one coordinator, one reviewer and a specialist":
      return copy("Bir koordinatör, bir inceleyen ve en az bir uzman belirleyin.", "Assign one coordinator, one reviewer and at least one specialist.");
    case "Duplicate crew members":
      return copy("Aynı üye ekipte birden fazla kez bulunamaz. Tekrarlanan üyeyi çıkarın.", "A member cannot appear twice in the crew. Remove the duplicate member.");
    case "Duplicate candidate IDs":
      return copy("Aynı model birden fazla seçilmiş. Tekrarlanan seçimi kaldırın.", "The same model is selected more than once. Remove the duplicate choice.");
    case "Invalid crew role":
      return copy("Üye için geçerli bir rol seçin.", "Choose a valid role for the member.");
    case "Invalid member selection":
      return copy("Sabit model veya otomatik model seçimi kullanın.", "Choose fixed or automatic model selection.");
    case "Invalid crew provider":
    case "Invalid model settings":
      return copy("Üyenin modelini ve model ayarlarını yeniden seçin.", "Select the member's model and model settings again.");
    case "Invalid member handle":
      return copy("Geçerli bir takma ad girin (küçük harf, rakam, tire; en fazla 24 karakter).", "Enter a valid handle (lowercase letters, digits, hyphens; up to 24 characters).");
    case "Duplicate member handles":
      return copy("Bir takma ad ekipte yalnızca bir üyede olabilir.", "A handle can belong to only one member of the crew.");
    case "Invalid member groups":
      return copy("En fazla 12 uzmanlık grubu girin; her grup adı 40 karakteri aşmasın.", "Enter up to 12 specialty groups, with at most 40 characters per name.");
    case "Invalid allocation policy":
      return copy("Çalışma ilkelerinden geçerli bir model seçme yaklaşımı seçin.", "Choose a valid allocation preference in Working policy.");
    case "Crew limits must be integers":
      return copy("Eşzamanlı görev ve görev sayısı sınırlarını tam sayı olarak girin.", "Enter whole numbers for parallel tasks and the assignment limit.");
    case "Invalid crew number":
      return member
        ? copy("Modelin maliyet ve kalite tahminlerini belirtilen aralıklarda girin.", "Enter the model's cost and quality estimates within the stated ranges.")
        : copy("Çalışma sınırlarını belirtilen aralıklarda girin.", "Enter the working limits within the stated ranges.");
    case "Invalid crew text":
      return member
        ? copy("Üye adını ve seçilen modellerin bilgilerini kontrol edin.", "Check the member name and the selected model details.")
        : copy("Ekip adını ve üye bilgilerini kontrol edin.", "Check the crew name and member details.");
    default:
      return copy("Ekip ayarları doğrulanamadı. Üye ve model bilgilerini kontrol edin.", "The crew settings could not be validated. Check the member and model details.");
  }
}

export function crewNameError(name: string, copy: CrewCopy, member = false): string | undefined {
  if (!name.trim()) return member ? copy("Üye adı girin.", "Enter a member name.") : copy("Ekip adı girin.", "Enter a crew name.");
  if (name.trim().length > 200) return copy("Ad en fazla 200 karakter olabilir.", "The name can contain at most 200 characters.");
  return undefined;
}

/** A new member is incomplete, not an error before the user interacts with that member. */
export function crewMemberPresentation(agent: CrewAgent, roleLabel: string, copy: CrewCopy, interacted = false) {
  const name = agent.name.trim();
  const label = name || roleLabel;
  const error = interacted
    ? crewNameError(agent.name, copy, true) ?? crewValidationMessage(memberValidation(agent), copy, true)
    : undefined;
  const model = agent.candidates.length
    ? agent.selection === "automatic" && agent.candidates.length > 1
      ? `${agent.candidates.length} ${copy("model", "models")}`
      : agent.candidates[0].model
    : copy("Model seçilmedi", "No model selected");
  const detail = error ?? [name && name.toLocaleLowerCase() !== roleLabel.toLocaleLowerCase() ? roleLabel : undefined, model].filter(Boolean).join(" · ");
  return { label, detail, error };
}

/** Validation follows the control that was touched, rather than any unrelated keystroke. */
export function memberValidationFeedback(
  member: CrewAgent,
  copy: CrewCopy,
  interaction: { name: boolean; models: boolean; dirty: boolean; submitted: boolean },
) {
  const error = memberValidation(member);
  if (!error) return undefined;
  if (error === "Choose at least one model per member")
    return interaction.models || interaction.submitted ? crewValidationMessage(error, copy, true) : undefined;
  if (crewNameError(member.name, copy, true))
    return interaction.name || interaction.submitted ? crewNameError(member.name, copy, true) : undefined;
  return interaction.dirty || interaction.submitted ? crewValidationMessage(error, copy, true) : undefined;
}
/** Bound collections before rendering. Nested definitions still use canonical host parsing. */
export function validateCrewDirectory(value: unknown, projectId?: string): CrewDirectory {
  if (!value || typeof value !== "object") throw new Error("Invalid crew directory");
  const data = value as Record<string, unknown>;
  if (![data.definitions, data.agents, data.runs].every((rows) => Array.isArray(rows) && rows.length <= 10000)) throw new Error("Invalid crew directory");
  for (const definition of data.definitions as unknown[]) {
    const parsed = parseCrewDefinition(definition);
    if (projectId && parsed.projectId && parsed.projectId !== projectId) throw new Error("Crew definition belongs to another project");
  }
  for (const agent of data.agents as Array<Record<string, unknown>>) {
    parseCrewAgent(agent);
    if (!Number.isSafeInteger(agent.updatedAt) || Number(agent.updatedAt) < 0 || (agent.projectId !== undefined && typeof agent.projectId !== "string")) throw new Error("Invalid saved crew member");
    if (projectId && agent.projectId && agent.projectId !== projectId) throw new Error("Crew member belongs to another project");
  }
  for (const run of data.runs as Array<Record<string, unknown>>) {
    if (!run || typeof run.id !== "string" || typeof run.projectId !== "string" || !["active", "paused", "finished"].includes(String(run.status)) ||
      !Array.isArray(run.tasks) || !Array.isArray(run.assignments) || !Array.isArray(run.messages)) throw new Error("Invalid crew run");
    parseCrewDefinition(run.definition);
    if (projectId && run.projectId !== projectId) throw new Error("Crew run belongs to another project");
    if (run.tasks.length > 1000 || run.assignments.length > 500 || run.messages.length > 500) throw new Error("Invalid crew run size");
    for (const task of run.tasks as Array<Record<string, unknown>>) {
      if (!task || typeof task.id !== "string" || typeof task.title !== "string" || typeof task.status !== "string" ||
        (task.sessionId !== undefined && typeof task.sessionId !== "string") || (task.error !== undefined && typeof task.error !== "string")) throw new Error("Invalid crew task");
    }
    for (const assignment of run.assignments as Array<Record<string, unknown>>) {
      if (!assignment || typeof assignment.taskId !== "string" || !assignment.candidate || typeof assignment.candidate !== "object" || typeof (assignment.candidate as Record<string, unknown>).model !== "string") throw new Error("Invalid crew assignment");
    }
  }
  return value as CrewDirectory;
}
