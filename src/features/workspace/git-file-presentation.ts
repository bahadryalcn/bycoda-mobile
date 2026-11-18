/**
 * Change kind, marker and badge tone for a host file status. Matches desktop `ChangeRow`:
 * added is success, deleted is danger, untracked is info, and plain modifications (and renames)
 * stay neutral so a long list is not a wall of color.
 */
export function gitFilePresentation(status: string) {
  const value = status.trim().toLowerCase();
  if (value === "deleted" || /^[ madrcut?!]*d[ madrcut?!]*$/.test(value))
    return { kind: "deleted", marker: "D", tone: "danger" } as const;
  if (value === "untracked" || value.includes("?"))
    return { kind: "untracked", marker: "U", tone: "info" } as const;
  if (value === "added" || /^[ madrcut!]*a[ madrcut!]*$/.test(value))
    return { kind: "added", marker: "A", tone: "success" } as const;
  if (value === "renamed" || /^[ madrcut!]*r[ madrcut!]*$/.test(value))
    return { kind: "renamed", marker: "R", tone: "default" } as const;
  return { kind: "modified", marker: "M", tone: "default" } as const;
}

type Kind = ReturnType<typeof gitFilePresentation>["kind"];

/** Localized change-kind name shared by the changes list and commit file rows. */
export function gitChangeLabel(kind: Kind, copy: (tr: string, en: string) => string): string {
  if (kind === "added") return copy("Eklendi", "Added");
  if (kind === "untracked") return copy("Takipsiz", "Untracked");
  if (kind === "deleted") return copy("Silindi", "Deleted");
  if (kind === "renamed") return copy("Yeniden adlandırıldı", "Renamed");
  return copy("Değiştirildi", "Modified");
}
