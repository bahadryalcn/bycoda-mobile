import { expect, it } from "vitest";
import { COMPOSER_FIELD_LIMIT, DRAFT_TEXT_LIMIT, LONG_PASTE_MIN_LENGTH, takeLongPaste } from "./long-paste-model";
import { ATTACHMENT_LIMIT } from "./attachment-model";

const long = (char = "x") => char.repeat(LONG_PASTE_MIN_LENGTH);

it("leaves typing and short pastes in the draft", () => {
  expect(takeLongPaste("hello", "hello!", 5)).toBeUndefined();
  expect(takeLongPaste("", "y".repeat(LONG_PASTE_MIN_LENGTH - 1), 0)).toBeUndefined();
  // Deleting from a long draft is not a paste.
  expect(takeLongPaste(long() + "z", long(), LONG_PASTE_MIN_LENGTH)).toBeUndefined();
});

it("takes a long paste at the caret and keeps the words around it", () => {
  const pasted = long("p");
  expect(takeLongPaste("see  please", `see ${pasted} please`, 4)).toEqual({ pasted, text: "see  please", caret: 4 });
});

it("anchors the paste at the caret when it repeats the surrounding draft", () => {
  // The pasted text starts with the character after the caret, so a plain diff would rotate it.
  const pasted = `a${"q".repeat(LONG_PASTE_MIN_LENGTH)}`;
  expect(takeLongPaste("ba", `b${pasted}a`, 1)).toEqual({ pasted, text: "ba", caret: 1 });
});

it("replaces a selected range with the paste", () => {
  const pasted = long("n");
  expect(takeLongPaste("keep OLD end", `keep ${pasted} end`, 5)).toEqual({ pasted, text: "keep  end", caret: 5 });
});

it("ignores a whitespace-only paste", () => {
  expect(takeLongPaste("", " ".repeat(LONG_PASTE_MIN_LENGTH), 0)).toBeUndefined();
});

it("lets the native field hold a full draft plus the largest attachment and one more character", () => {
  expect(COMPOSER_FIELD_LIMIT).toBe(DRAFT_TEXT_LIMIT + ATTACHMENT_LIMIT + 1);
});
