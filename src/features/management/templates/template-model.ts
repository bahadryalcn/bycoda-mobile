export type PromptTemplate = { id: string; name: string; body: string; trigger?: string };
export const MAX_TEMPLATES = 100;
export const MAX_TEMPLATE_BODY = 20_000;

export function normalizeTemplates(rows: readonly PromptTemplate[]): PromptTemplate[] {
  if (rows.length > MAX_TEMPLATES) throw new Error("Keep at most 100 templates");
  const ids = new Set<string>();
  const triggers = new Set<string>();
  return rows.map((row) => {
    if (typeof row.id !== "string" || !row.id || ids.has(row.id) || typeof row.name !== "string" ||
      !row.name.trim() || typeof row.body !== "string" || !row.body.trim() || row.body.length > MAX_TEMPLATE_BODY)
      throw new Error("Every template needs a unique ID, name and text of up to 20,000 characters");
    ids.add(row.id);
    const trigger = (row.trigger ?? "").trim().replace(/^;/, "").toLowerCase();
    if (trigger && (!/^[a-z0-9][a-z0-9-]{0,23}$/.test(trigger) || triggers.has(trigger)))
      throw new Error("Triggers must be unique, with 1–24 letters, numbers or dashes");
    if (trigger) triggers.add(trigger);
    return { id: row.id, name: row.name.trim(), body: row.body, ...(trigger ? { trigger } : {}) };
  });
}

export function insertTemplate(text: string, selection: { start: number; end: number }, body: string) {
  const start = Math.max(0, Math.min(text.length, selection.start));
  const end = Math.max(start, Math.min(text.length, selection.end));
  const marker = body.indexOf("{{cursor}}");
  const inserted = body.replaceAll("{{cursor}}", "");
  const position = start + (marker < 0 ? inserted.length : marker);
  return { text: text.slice(0, start) + inserted + text.slice(end), selection: { start: position, end: position } };
}

/** Expand only an unambiguous just-typed terminal space, never pasted text or a send. */
export function expandTemplateTrigger(previous: string, text: string, selection: { start: number; end: number }, rows: PromptTemplate[]) {
  if (text !== previous + " " || selection.start !== previous.length || selection.end !== previous.length) return null;
  const match = previous.match(/(?:^|\s);([a-z0-9][a-z0-9-]{0,23})$/);
  const row = match && rows.find((entry) => entry.trigger === match[1]);
  return row && match ? insertTemplate(text, { start: previous.length - match[1]!.length - 1, end: text.length }, row.body) : null;
}
