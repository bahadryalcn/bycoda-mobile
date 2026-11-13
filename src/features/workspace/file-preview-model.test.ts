import { expect, it } from "vitest";
import { isMediaFile } from "./file-preview-model";

it.each(["report.doc", "report.DOCX", "data.xls", "data.xlsx", "deck.ppt", "deck.pptx", "book.epub", "bundle.tar", "bundle.tar.gz", "song.aac", "song.opus", "clip.mkv", "picture.tiff", "font.otf", "cache.db", "report.pdf#L42", "report.docx:12:3"])("routes known binary %s outside text editing", path => {
  expect(isMediaFile(path)).toBe(true);
});
it.each(["README", "Dockerfile", ".gitignore", ".env.local", "custom.format", "notes.md", "config.json", "src/main.ts", "readme.txt:42", "src/foo.rs#L5"])("preserves text-first inspection for %s", path => {
  expect(isMediaFile(path)).toBe(false);
});
