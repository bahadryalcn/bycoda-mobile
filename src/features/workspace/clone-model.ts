export type CloneProblem = "url" | "name" | null;

/** Same acceptance as the Host `projects.clone`; the Host re-validates every field. */
export function cloneUrlProblem(raw: string): boolean {
  const url = raw.trim();
  return (
    !url ||
    url.length > 2048 ||
    url.startsWith("-") ||
    /[\s\u0000-\u001f\u007f]/.test(url) ||
    !/^(https?:\/\/|ssh:\/\/|git:\/\/|git@)/i.test(url)
  );
}

/** Repository name the Host infers from the URL; null when none can be inferred. */
export function inferCloneName(raw: string): string | null {
  const name =
    raw
      .trim()
      .replace(/\/+$/, "")
      .replace(/\.git$/, "")
      .split(/[/:]/)
      .pop()
      ?.trim() ?? "";
  return !name || name === "." || name === ".." ? null : name;
}

export function cloneNameProblem(name: string): boolean {
  return (
    name !== name.trim() ||
    name === "." ||
    name === ".." ||
    name.startsWith("-") ||
    /[\\/\u0000-\u001f<>:"|?*]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)
  );
}

export type CloneDraft = { url: string; name: string };

/** The first blocking problem, or null when the draft can be sent. */
export function cloneDraftProblem(draft: CloneDraft): CloneProblem {
  if (cloneUrlProblem(draft.url)) return "url";
  if (draft.name ? cloneNameProblem(draft.name) : inferCloneName(draft.url) === null) return "name";
  return null;
}

/** Host params; an empty name lets the Host infer it from the URL. */
export function cloneParams(draft: CloneDraft, parentPath: string, operationId: string) {
  return {
    url: draft.url.trim(),
    parentPath,
    ...(draft.name ? { name: draft.name } : {}),
    operationId,
  };
}

export type CloneProgress = { state: "running" | "done" | "failed"; phase: string; percent: number | null };

/** A short status line such as "Receiving objects 45%". */
export function cloneProgressLabel(progress: CloneProgress | null | undefined): string | null {
  if (!progress || progress.state !== "running") return null;
  return progress.percent === null ? progress.phase : `${progress.phase} ${progress.percent}%`;
}
