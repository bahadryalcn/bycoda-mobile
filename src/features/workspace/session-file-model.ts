import type { Block } from "./wire";

export type SessionFile = {
  key: string;
  id: string;
  name: string;
  path?: string;
  mimeType: string;
  size?: number;
  source: "user" | "agent";
  kind: "image" | "audio" | "file";
};

export type SessionFileFilters = {
  source: "all" | SessionFile["source"];
  kind: "all" | SessionFile["kind"];
};

export const defaultSessionFileFilters: SessionFileFilters = { source: "all", kind: "all" };

/** Metadata only: loading an index never fetches private file bytes or previews. */
export function sessionFileIndex(blocks: readonly Block[]): SessionFile[] {
  return blocks.flatMap((block) => {
    if (block.internal) return [];
    const source = block.role === "user" ? "user" : "agent";
    const files: SessionFile[] = [];
    if (block.image) {
      files.push({
        key: JSON.stringify([block.id, "image"]),
        id: block.id,
        name: block.image.name,
        path: block.image.path,
        mimeType: block.image.mimeType,
        size: block.image.size,
        source,
        kind: "image",
      });
    }
    block.attachments?.forEach((file, index) => {
      files.push({
        key: JSON.stringify([block.id, "attachment", index, file.id]),
        id: file.id,
        name: file.name,
        path: file.path,
        mimeType: file.mimeType,
        size: file.size,
        kind: file.kind,
        source,
      });
    });
    return files;
  });
}

export function filterSessionFiles(
  files: readonly SessionFile[],
  search: string,
  filters: SessionFileFilters,
): SessionFile[] {
  const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return files.filter((file) => {
    if (filters.source !== "all" && file.source !== filters.source) return false;
    if (filters.kind !== "all" && file.kind !== filters.kind) return false;
    const text = `${file.name}\n${file.path ?? ""}\n${file.mimeType}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
