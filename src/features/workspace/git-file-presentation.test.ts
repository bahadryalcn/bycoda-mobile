import { expect, it } from "vitest";
import { gitFilePresentation } from "./git-file-presentation";

it.each([
  ["deleted", "D", "danger"],
  [" D", "D", "danger"],
  ["added", "A", "success"],
  ["A ", "A", "success"],
  ["untracked", "A", "success"],
  ["??", "A", "success"],
  ["renamed", "R", "info"],
  ["R ", "R", "info"],
  ["modified", "M", "info"],
  [" M", "M", "info"],
])("presents host file status %s", (status, marker, tone) => {
  expect(gitFilePresentation(status)).toMatchObject({ marker, tone });
});
