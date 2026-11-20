import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for #443: in Android widget rows the leading text must take the remaining width and
// ellipsize, so the project label after it is never pushed out of the card.
const readSource = (file: string) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");

/** Opening tag of the <Text> whose body is `content` (the last match, for repeated bodies). */
function openingTagOf(file: string, content: string) {
  const text = readSource(file);
  const index = text.lastIndexOf(content);
  expect(index).toBeGreaterThan(-1);
  const start = text.lastIndexOf("<Text", index);
  return text.slice(start, text.indexOf(">", start) + 1);
}

describe("Android widget rows keep the project label visible (#443)", () => {
  it.each([
    ["ActiveSessions.android.tsx", "{row.startedLabel || row.detail}"],
    ["NeedsAttention.android.tsx", "{row.detail}"],
    ["UsageLimits.android.tsx", "{row.label}"],
  ])("%s: leading text takes the remaining width and ellipsizes", (file, content) => {
    const tag = openingTagOf(file, content);
    expect(tag).toContain("modifiers={[weight(1)]}");
    expect(tag).toContain('overflow="ellipsis"');
  });

  it("ActiveSessions: the project label stays at its natural width", () => {
    const tag = openingTagOf("ActiveSessions.android.tsx", "{` · ${row.project}`}");
    expect(tag).not.toContain("weight(");
  });

  it("ActiveSessions and NeedsAttention: the text column can shrink before the project label", () => {
    for (const file of ["ActiveSessions.android.tsx", "NeedsAttention.android.tsx"]) {
      expect(readSource(file)).toContain('<Column modifiers={[weight(1)]}>');
    }
  });
});
