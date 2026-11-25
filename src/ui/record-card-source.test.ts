import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recordSpokenLabel } from "./record-card-label";

const card = readFileSync(new URL("./record-card.tsx", import.meta.url), "utf8");

/** #1118: a hint must not replace the spoken status and metadata of a record. */
describe("recordSpokenLabel", () => {
  it("speaks title, status and metadata in order", () => {
    expect(recordSpokenLabel({ title: "Deploy", status: "Failed", metadata: "3 runs · today" })).toBe("Deploy. Failed. 3 runs · today");
  });

  it("omits absent parts and never repeats one", () => {
    expect(recordSpokenLabel({ title: "Deploy" })).toBe("Deploy");
    expect(recordSpokenLabel({ title: "Paused", status: "Paused", metadata: " " })).toBe("Paused");
  });
});

describe("RecordCard identity accessibility", () => {
  it("labels the identity from its visible parts only when a hint would replace them", () => {
    expect(card).toContain("accessibilityLabel={hint ? recordSpokenLabel({ title, status: statusLabel ?? (typeof status === \"string\" ? status : undefined), metadata }) : undefined}");
  });

  it("announces the hint separately instead of folding it into the label", () => {
    expect(card).toContain("accessibilityHint={hint}");
    expect(card).not.toMatch(/accessibilityLabel=\{[^}]*\$\{hint\}/);
  });

  it("keeps the disclosure state and the single-level details body", () => {
    expect(card).toContain("accessibilityState={expandable ? { expanded } : undefined}");
    expect(card).toContain('accessibilityRole={expandable ? "button" : undefined}');
    expect(card).toContain("{visited && expandable ? (");
  });

  it("opens the same record actions from the options button, a long press and the screen-reader action", () => {
    expect(card).toContain("onLongPress={options.available ? options.open : undefined}");
    expect(card).toContain('accessibilityActions={options.available && actions ? [{ name: "longpress", label: actions.label }] : undefined}');
    expect(card).toContain("<ActionMenu label={actions.label} subtitle={actions.subtitle ?? title} actions={actions.items} busy={actions.busy} />");
    expect(card).not.toContain("<Hint");
  });

  it("shows persistent record failures as one quiet line each and the full text when expanded", () => {
    expect(card).toContain('<StatusLine key={index} tone="danger" label={problem} />');
    expect(card).not.toContain("<ErrorNotice");
  });
});
