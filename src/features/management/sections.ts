/** Route and directory labels share one inventory, independent of UI imports. */
export const managementSections = {
  inbox: ["Gelen kutusu", "Inbox"],
  tasks: ["Görevler", "Tasks"],
  goals: ["Epicler", "Epics"],
  crews: ["Ekipler", "Crews"],
  automations: ["Otomasyonlar", "Automations"],
  notes: ["Notlar", "Notes"],
  stewards: ["Proje sorumluları", "Project stewards"],
} as const;

export type ManagementSection = keyof typeof managementSections;
export function isManagementSection(section: string): section is ManagementSection {
  return Object.hasOwn(managementSections, section);
}
