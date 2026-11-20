import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editor = readFileSync(new URL("./file-editor.tsx", import.meta.url), "utf8");
const fields = readFileSync(new URL("../../ui/fields.tsx", import.meta.url), "utf8");

describe("file editor save placement", () => {
  it("keeps Save and its status in the shared Screen footer outside the scrolling body", () => {
    expect(editor).toContain("<Screen scroll={!fullHeightEditor} footer={footer}>");
    expect(editor).toContain("<FormActions");
    expect(editor).toContain('submitLabel={copy("Kaydet", "Save")}');
    expect(editor).toContain("busy={save.isPending}");
    expect(editor).toContain("disabled={!dirty || transition.isPending}");
    expect(editor).toContain("isFileConflict(save.error)");
  });

  it("makes the editor the single scroll owner while editing and keeps preview scrollable", () => {
    expect(editor).toContain("const fullHeightEditor = showEditor && editing;");
    expect(editor).toContain("{fullHeightEditor ? <View style={editorBody}>{editorPanel}</View> : editorPanel}");
    expect(editor).toMatch(/<Input[\s\S]*?\bfill\b[\s\S]*?\/>/);
    expect(editor).not.toContain("height * 0.45");
    expect(editor).not.toContain("useWindowDimensions");
  });

  it("does not put Save inside the body row where it can scroll away", () => {
    expect(editor).not.toMatch(/<Row[^>]*>\s*<View[^>]*>\s*<SegmentedControl/);
    expect(editor).not.toMatch(/<Button\s+label=\{copy\("Kaydet"/);
  });

  it("keeps the draft and save mutation guarded by the same owners", () => {
    expect(editor).toContain("draft.setValue((current) => ({");
    expect(editor).toContain("expected: submitted.expected,");
    expect(editor).toContain("if (save.isPending || transition.isPending) return;");
    expect(editor).toContain('confirmation?.kind === "reload"');
  });
});

describe("shared Input fill", () => {
  it("lets a multiline field fill its parent and scroll inside itself", () => {
    expect(fields).toContain('containerClassName={fill ? "gap-0 flex-1" : "gap-0"}');
    expect(fields).toContain("fill && { flex: 1, minHeight: 0 },");
    expect(fields).toContain("flex: fill ? 1 : flex,");
  });
});
