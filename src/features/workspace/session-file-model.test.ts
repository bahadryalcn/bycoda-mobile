import { expect, it } from "vitest";
import {
  defaultSessionFileFilters,
  filterSessionFiles,
  sessionFileIndex,
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
