import { expect, it } from "vitest";
import {
  defaultSessionFileFilters,
  filterSessionFiles,
  sessionFileIndex,
  sessionFileIndexWhileOpen,
} from "./session-file-model";
import type { Block } from "./wire";

const attachment = {
  id: "file-1",
  name: "Design.pdf",
  path: "docs/Design.pdf",
  mimeType: "application/pdf",
  size: 2048,
  kind: "file" as const,
};
const blocks: Block[] = [
  { id: "internal", role: "assistant", text: "", internal: true, attachments: [attachment] },
  { id: "user", role: "user", text: "", attachments: [attachment] },
  {
    id: "agent",
    role: "assistant",
    text: "",
    image: { name: "Preview.png", path: "output/Preview.png", mimeType: "image/png", size: 512 },
  },
  {
    id: "audio",
    role: "user",
    text: "",
    attachments: [
      {
        ...attachment,
        id: "recording",
        name: "Voice.m4a",
        path: "recordings/Voice.m4a",
        mimeType: "audio/mp4",
        kind: "audio",
      },
    ],
  },
];

it("excludes internal blocks and indexes generated and uploaded files without loading bytes", () => {
  const index = sessionFileIndex(blocks);
  expect(index).toHaveLength(3);
  expect(index.map((file) => [file.id, file.source, file.kind, file.size])).toEqual([
    ["file-1", "user", "file", 2048],
    ["agent", "agent", "image", 512],
    ["recording", "user", "audio", 2048],
  ]);
  expect(index[0]).not.toHaveProperty("data");
});

it("keeps separate occurrences of the same file addressable", () => {
  const index = sessionFileIndex([
    { id: "one", role: "user", text: "", attachments: [attachment, attachment] },
    { id: "two", role: "user", text: "", attachments: [attachment] },
  ]);
  expect(new Set(index.map((file) => file.key)).size).toBe(3);
  expect(index.map((file) => file.id)).toEqual(["file-1", "file-1", "file-1"]);
});

it("matches every search term against name, host path and content type", () => {
  const index = sessionFileIndex(blocks);
  expect(
    filterSessionFiles(index, "  DOCS pdf ", defaultSessionFileFilters).map((file) => file.name),
  ).toEqual(["Design.pdf"]);
  expect(filterSessionFiles(index, "absent", defaultSessionFileFilters)).toEqual([]);
  expect(filterSessionFiles(index, "", { source: "agent", kind: "image" })).toEqual([index[1]]);
  expect(filterSessionFiles(index, "", { source: "user", kind: "image" })).toEqual([]);
  expect(index).toHaveLength(3);
});

it("matches Turkish dotted and dotless letters without changing all-term search", () => {
  const files = sessionFileIndex([{ id: "tr", role: "user", text: "", attachments: [{ ...attachment, name: "İLETİŞİM IŞIK.pdf", path: "Belgeler/İLETİŞİM.pdf" }] }]);
  expect(filterSessionFiles(files, "ışık iletişim", defaultSessionFileFilters, "tr")).toHaveLength(1);
  expect(filterSessionFiles(files, "iletisim", defaultSessionFileFilters, "tr")).toHaveLength(0);
  expect(filterSessionFiles(files, "iletişim absent", defaultSessionFileFilters, "tr")).toHaveLength(0);
});

it("walks the transcript only while the files sheet is open and reads current blocks on open", () => {
  // A closed sheet must never touch the transcript: a throwing walk proves no indexing ran.
  const unwalked = { flatMap: () => { throw new Error("transcript walked while closed"); } } as unknown as Block[];
  expect(sessionFileIndexWhileOpen(false, unwalked)).toEqual([]);

  const first: Block[] = [{ id: "u1", role: "user", text: "", attachments: [attachment] }];
  expect(sessionFileIndexWhileOpen(false, first)).toEqual([]);
  expect(sessionFileIndexWhileOpen(true, first).map((file) => file.id)).toEqual(["file-1"]);

  // Blocks that streamed in while closed are indexed when the sheet opens.
  const streamed: Block[] = [...first, { id: "a1", role: "assistant", text: "", image: { name: "Chart.png", path: "out/Chart.png", mimeType: "image/png", size: 64 } }];
  expect(sessionFileIndexWhileOpen(true, streamed).map((file) => file.name)).toEqual(["Design.pdf", "Chart.png"]);
});
