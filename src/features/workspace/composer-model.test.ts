import { describe, expect, it } from "vitest";
import { composerTokenAt, mentionLabel, replaceComposerToken, moveSuggestionSelection } from "./composer-tokens";
import { decodeComposerDraft, emptyComposerDraft, encodeComposerDraft } from "./composer-draft";
import { base64ToBytes, bytesToBase64, validateAttachment } from "./attachment-model";
import { mentionSources, rankComposerSuggestions, workItemLabel, type ComposerSuggestion } from "./composer-catalog-model";
const token = (text: string, cursor = text.length) => composerTokenAt(text, { start: cursor, end: cursor });
describe("scoped composer intent", () => {
  it.each([1, 2, 4])("starts upward selection at the final suggestion and wraps all %s rows", (count) => {
    expect(moveSuggestionSelection(-1, count, -1)).toBe(count - 1);
    expect(moveSuggestionSelection(-1, count, 1)).toBe(0);
    expect(moveSuggestionSelection(0, count, -1)).toBe(count - 1);
    expect(moveSuggestionSelection(count - 1, count, 1)).toBe(0);
    const visited = new Set<number>();
    let selected = -1;
    for (let index = 0; index < count; index++) { selected = moveSuggestionSelection(selected, count, -1); visited.add(selected); }
    expect(visited.size).toBe(count);
    expect(moveSuggestionSelection(selected, 0, -1)).toBe(-1);
  });
  it("replaces the entire caret token while preserving suffix text", () => {
    const text = "Check @src/appl.ts then continue";
    const picked = token(text, 13)!;
    expect(picked.trigger).toBe("@");
    expect(replaceComposerToken(text, picked, "src/app.ts").text).toBe("Check @src/app.ts then continue");
    expect(token("/çalış")?.query).toBe("çalış"); expect(token("$skill")?.trigger).toBe("$");
    expect(mentionLabel("docs/My note.md")).toBe('"docs/My note.md"');
  });
  it("recognizes desktop tracker aliases and opens the selected source without closing the token", () => {
    expect(mentionSources("jr")).toMatchObject({ source: "jira", needle: "" });
    expect(mentionSources("jira:DEV-12")).toMatchObject({ source: "jira", needle: "DEV-12" });
    expect(mentionSources("gh:owner/repo#12")).toMatchObject({ source: "github", needle: "owner/repo#12" });
    expect(mentionSources("github")).toMatchObject({ source: "github", needle: "" });
    expect(mentionSources("crew")).toMatchObject({ source: "crews", needle: "" });
    expect(mentionSources("lead.ts").source).toBeUndefined();
    const text = "Read @jr then report";
    expect(replaceComposerToken(text, token(text, 8)!, "jira:", false)).toEqual({ text: "Read @jira: then report", cursor: 11 });
  });
  it("uses desktop work-item references and caps results by group", () => {
    const item = { provider: "github", kind: "pr", repo: "owner/repo", number: 12 } as Parameters<typeof workItemLabel>[0];
    expect(workItemLabel(item)).toBe("gh:owner/repo#12");
    expect(workItemLabel({ ...item, provider: "jira", identifier: "DEV-12" })).toBe("jira:DEV-12");
    expect(workItemLabel({ ...item, provider: "gitlab" })).toBe("gl:owner/repo!12");
    const files = Array.from({ length: 40 }, (_, id): ComposerSuggestion => ({
      id: String(id), name: `test-${id}`, kind: "file", label: "", detail: "", group: "files",
    }));
    const source: ComposerSuggestion = { id: "gh", name: "GitHub", kind: "source", label: "github:", detail: "", group: "sources" };
    const suggestions = rankComposerSuggestions([...files, source], "", false);
    expect(suggestions[0]).toBe(source);
    expect(suggestions.slice(1)).toHaveLength(12);
  });
  it("does not offer commands inside quotes, code, math, nonempty selections or URLs", () => {
    for (const text of ["> /goal", "`$skill", "```ts\n@file", "a$b", "https://example.com/goal", "$x + $skill", '"@file']) expect(token(text), text).toBeNull();
    expect(composerTokenAt("/goal", { start: 1, end: 3 })).toBeNull();
  });
  it("migrates literal prose without mistaking pasted JSON for an attachment draft", () => {
    const raw = '{"version":2,"text":"literal","attachments":[]}';
    expect(decodeComposerDraft(raw).text).toBe(raw);
    const value = { ...emptyComposerDraft(), text: "hello", selectedMentionRefs: [{ label: "src/main.ts", path: "src/main.ts" }] };
    expect(decodeComposerDraft(encodeComposerDraft(value)!)).toEqual(value);
    expect(encodeComposerDraft(emptyComposerDraft())).toBeNull();
  });
  it("retains exact binary bytes and rejects invalid attachment declarations", () => {
    const bytes = Uint8Array.from([0, 1, 2, 254, 255]); expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    expect(() => base64ToBytes("%%%%")).toThrow();
    for (const size of [-1, Infinity, 20 * 1024 * 1024 + 1, 0.5]) expect(() => validateAttachment({ name: "file", size })).toThrow();
    expect(() => validateAttachment({ name: "empty", size: 0 })).not.toThrow();
  });
});
