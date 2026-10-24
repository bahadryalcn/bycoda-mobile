import { expect, it } from "vitest";
import { compareLinesAsync, diffLines, diffLinesAsync, previewChanges } from "./git-diff-preview";
import { selectiveHunks, selectedStageContents } from "./git-selective-model";

it("yields before publishing a changed result and retains preview and raw staging bytes", async () => {
  const original = "header\r\nold\r\nfooter\r\n";
  const current = "header\r\nnew\r\nfooter\r\n";
  let settled = false;
  const work = compareLinesAsync(original, current).then((value) => { settled = true; return value; });
  expect(settled).toBe(false);
  const changes = await work;
  expect(previewChanges(changes)).toEqual(diffLines(original, current));
  const hunks = selectiveHunks(original, current, changes);
  expect(selectedStageContents(original, hunks, new Set(hunks.flatMap((hunk) => hunk.lines.map((line) => line.id))))).toBe(current);
});
it("releases an aborted owner without applying a stale result", async () => {
  const controller = new AbortController();
  const work = diffLinesAsync("a\n".repeat(200), "b\n".repeat(200), controller.signal);
  const rejection = expect(work).rejects.toThrow("cancelled"); controller.abort(); await rejection;
});
it("lets the event loop run during a large comparison", async () => {
  let ticked = false;
  const timer = setTimeout(() => { ticked = true; }, 0);
  const prefix = "unchanged context line\n".repeat(6_000);
  const result = await diffLinesAsync(prefix + "old\n", prefix + "new\n");
  clearTimeout(timer);
  expect(ticked).toBe(true);
  expect(result.tooLarge).toBe(false);
  expect(result.lines.filter((line) => line.kind !== "same").map((line) => line.text)).toEqual(["old", "new"]);
});
