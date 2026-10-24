export type ShellChoices = { profiles: { id: string; name: string; path: string; kind: string }[]; defaultId: string | null; chosenId: string | null };
export function readShellChoices(value: unknown): ShellChoices {
  const row = value as ShellChoices | null;
  const id = (input: unknown) => input === null || typeof input === "string" && /^[a-zA-Z0-9._-]{1,128}$/.test(input);
  if (!row || !Array.isArray(row.profiles) || row.profiles.length > 64 || !id(row.defaultId) || !id(row.chosenId) ||
    !row.profiles.every((profile) => profile && typeof profile.id === "string" && id(profile.id) && [profile.name, profile.path, profile.kind].every((text) => typeof text === "string" && text.length > 0 && text.length <= 4096 && !/[\0\r\n]/.test(text))) ||
    new Set(row.profiles.map((profile) => profile.id)).size !== row.profiles.length || row.defaultId !== null && !row.profiles.some((profile) => profile.id === row.defaultId))
    throw new Error("Invalid command shell preferences");
  return row;
}
export function shellChoiceRequest(snapshot: ShellChoices, selected: string) {
  if (selected !== "" && !snapshot.profiles.some((profile) => profile.id === selected)) throw new Error("Select an installed command shell.");
  return { profile: selected || null, expectedChosenId: snapshot.chosenId };
}
