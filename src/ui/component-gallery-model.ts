import { componentCatalog, type ComponentCatalogEntry } from "./catalog";

export type GalleryExample = "controls" | "chat" | "data";
export type GalleryGroup = ComponentCatalogEntry["group"];
export const galleryGroups: readonly GalleryGroup[] = [
  "forms",
  "chat",
  "layout",
  "navigation",
  "overlays",
  "data",
  "media",
];

/** Exact demo coverage; other installed modules remain discoverable in the catalog. */
const exampleComponents: Record<GalleryExample, readonly string[]> = {
  controls: [
    "button",
    "input",
    "textarea",
    "switch",
    "checkbox",
    "radio-group",
    "slider",
    "tabs",
    "card",
    "typography",
    "badge",
    "alert",
    "spinner",
    "skeleton",
    "accordion",
    "avatar",
  ],
  chat: ["ai-input", "message", "attachment", "plan", "reasoning"],
  data: ["table", "timeline", "progress"],
};

export function galleryExampleFor(id: string): GalleryExample | undefined {
  return (Object.keys(exampleComponents) as GalleryExample[]).find((key) =>
    exampleComponents[key].includes(id),
  );
}

export function filterGalleryCatalog({
  search = "",
  group,
  coreOnly = false,
}: {
  search?: string;
  group?: GalleryGroup;
  coreOnly?: boolean;
} = {}) {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return componentCatalog.filter(
    (item) =>
      (!group || item.group === group) &&
      (!coreOnly || item.priority === "core") &&
      terms.every((term) => `${item.id} ${item.group} ${item.priority}`.includes(term)),
  );
}
