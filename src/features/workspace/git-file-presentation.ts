export function gitFilePresentation(status: string) {
  const value = status.trim().toLowerCase();
  if (value === "deleted" || /^[ madrcut?!]*d[ madrcut?!]*$/.test(value))
    return { kind: "deleted", marker: "D", tone: "danger" } as const;
  if (
    value === "added" ||
    value === "untracked" ||
    value.includes("?") ||
    /^[ madrcut!]*a[ madrcut!]*$/.test(value)
  )
    return { kind: "added", marker: "A", tone: "success" } as const;
  if (value === "renamed" || /^[ madrcut!]*r[ madrcut!]*$/.test(value))
    return { kind: "renamed", marker: "R", tone: "info" } as const;
  return { kind: "modified", marker: "M", tone: "info" } as const;
}
