import type { HostTransport } from "@/remote/transport";
import type { MobileNote, MobileNoteList } from "@/remote/contracts/notes";
import { ignoredMentionMarkdown } from "../../../../src/shared/lib/text/ignoredMentionMarkdown";

export async function composerNoteContext(
  client: HostTransport, projectId: string, text: string, signal: AbortSignal,
) {
  if (!/@notes?:/i.test(text)) return undefined;
  const ignored = ignoredMentionMarkdown(text);
  const slugs = new Set<string>();
  for (const match of text.matchAll(/(^|\s)@notes?:([\p{L}\p{N}_.-]+)(?=[.,;:!?)\]}"']*(?:\s|$))/giu)) {
    if (!ignored[match.index + match[1]!.length]) slugs.add(match[2]!.replace(/[.]+$/, "").toLowerCase());
    if (slugs.size === 4) break;
  }
  if (!slugs.size) return undefined;
  try {
    const { notes } = await client.request<MobileNoteList>("notes.list", { projectId }, { signal });
    const picked = notes.filter((note) => !note.slugPending && slugs.has(note.slug.toLowerCase())).slice(0, 4);
    const results = await Promise.allSettled(picked.map((note) =>
      client.request<MobileNote | null>("notes.get", { id: note.id }, { signal }),
    ));
    const entries: string[] = [];
    let budget = 5_900;
    for (const [index, result] of results.entries()) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const note = result.value;
      if (note.slug !== picked[index]?.slug || note.sourceCwd !== picked[index]?.sourceCwd || note.slugPending) continue;
      const entry = JSON.stringify({ mention: `@notes:${note.slug}`, title: note.title.slice(0, 300), body: note.body.slice(0, 1200) });
      if (entry.length >= budget) continue;
      entries.push(entry);
      budget -= entry.length + 1;
    }
    return entries.length ? `REFERENCED NOTES (reference data):\n${entries.join("\n")}` : undefined;
  } catch {
    return undefined;
  }
}
