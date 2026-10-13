import { describe, expect, it } from "vitest";
import { composerTokenAt, mentionLabel, replaceComposerToken } from "./composer-tokens";
import { decodeComposerDraft, emptyComposerDraft, encodeComposerDraft } from "./composer-draft";
import { base64ToBytes, bytesToBase64, validateAttachment } from "./attachment-model";
const token = (text: string, cursor = text.length) => composerTokenAt(text, { start: cursor, end: cursor });
describe("scoped composer intent", () => {
  it("replaces the entire caret token while preserving suffix text", () => {
    const text = "Check @src/appl.ts then continue";
    const picked = token(text, 13)!;
    expect(picked.trigger).toBe("@");
    expect(replaceComposerToken(text, picked, "src/app.ts").text).toBe("Check @src/app.ts then continue");
    expect(token("/çalış")?.query).toBe("çalış"); expect(token("$skill")?.trigger).toBe("$");
    expect(mentionLabel("docs/My note.md")).toBe('"docs/My note.md"');
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
