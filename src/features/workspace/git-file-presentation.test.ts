import { expect, it } from "vitest";
import { gitChangeLabel, gitFilePresentation } from "./git-file-presentation";

it.each([
  ["deleted", "D", "danger"],
  [" D", "D", "danger"],
  ["added", "A", "success"],
  ["A ", "A", "success"],
  ["untracked", "U", "info"],
  ["??", "U", "info"],
  ["renamed", "R", "default"],
  ["R ", "R", "default"],
  ["modified", "M", "default"],
  [" M", "M", "default"],
])("presents host file status %s", (status, marker, tone) => {
  expect(gitFilePresentation(status)).toMatchObject({ marker, tone });
});

it("names untracked files separately from added ones", () => {
  const copy = (_tr: string, en: string) => en;
  expect(gitChangeLabel(gitFilePresentation("??").kind, copy)).toBe("Untracked");
  expect(gitChangeLabel(gitFilePresentation("added").kind, copy)).toBe("Added");
});
