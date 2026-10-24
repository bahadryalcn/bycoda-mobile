import { describe, expect, it } from "vitest";
import { expandTemplateTrigger, insertTemplate, normalizeTemplates } from "./template-model";
const row = { id: "one", name: " Review ", body: "Review {{cursor}}carefully", trigger: ";REVIEW" };
describe("phone prompt templates", () => {
  it("normalizes desktop-compatible triggers and rejects duplicates and invalid content", () => {
    expect(normalizeTemplates([row])[0]).toMatchObject({ name: "Review", trigger: "review" });
    expect(() => normalizeTemplates([row, { ...row, id: "two" }])).toThrow();
    expect(() => normalizeTemplates([{ ...row, body: " " }])).toThrow();
    expect(() => normalizeTemplates([{ ...row, body: "x".repeat(20001) }])).toThrow();
  });
  it("inserts only the selected range and places the cursor without dropping the suffix", () => {
    expect(insertTemplate("before SELECT after", { start: 7, end: 13 }, "a{{cursor}}b")).toEqual({
      text: "before ab after", selection: { start: 8, end: 8 },
    });
  });
  it("expands explicit typed trigger while ignoring pasted text and mid-message ambiguous input", () => {
    const rows = normalizeTemplates([row]);
    expect(expandTemplateTrigger(";review", ";review ", { start: 7, end: 7 }, rows)?.text).toBe("Review carefully");
    expect(expandTemplateTrigger("", ";review ", { start: 0, end: 0 }, rows)).toBeNull();
    expect(expandTemplateTrigger(";review", ";review ", { start: 2, end: 2 }, rows)).toBeNull();
  });
});
