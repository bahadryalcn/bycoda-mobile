/** Installed gluestack v5 UniWind source catalog, customized for bycoda. */
export const componentCatalog = [
  {
    id: "accordion",
    group: "navigation",
    capability: "universal",
  },
  {
    id: "actionsheet",
    group: "overlays",
    capability: "universal",
  },
  {
    id: "alert",
    group: "feedback",
    capability: "universal",
  },
  {
    id: "alert-dialog",
    group: "overlays",
    capability: "universal",
  },
  {
    id: "avatar",
    group: "text",
    capability: "universal",
  },
  {
    id: "badge",
    group: "feedback",
    capability: "universal",
  },
  {
    id: "bottomsheet",
    group: "overlays",
    capability: "native-gesture-sheet",
  },
  {
    id: "box",
    group: "layout",
    capability: "universal",
  },
  {
    id: "button",
    group: "controls",
    capability: "universal",
  },
  {
    id: "calendar",
    group: "controls",
    capability: "universal",
  },
  {
    id: "card",
    group: "layout",
    capability: "universal",
  },
  {
    id: "center",
    group: "layout",
    capability: "universal",
  },
  {
    id: "chat-ai",
    group: "chat",
    capability: "universal",
  },
  {
    id: "checkbox",
    group: "controls",
    capability: "universal",
  },
  {
    id: "date-time-picker",
    group: "controls",
    capability: "universal",
  },
  {
    id: "divider",
    group: "layout",
    capability: "universal",
  },
  {
    id: "drawer",
    group: "overlays",
    capability: "universal",
  },
  {
    id: "fab",
    group: "controls",
    capability: "universal",
  },
  {
    id: "flat-list",
    group: "lists",
    capability: "universal",
  },
  {
    id: "form-control",
    group: "controls",
    capability: "universal",
  },
  {
    id: "gluestack-ui-provider",
    group: "platform",
    capability: "universal",
  },
  {
    id: "grid",
    group: "layout",
    capability: "universal",
  },
  {
    id: "heading",
    group: "text",
    capability: "universal",
  },
  {
    id: "hstack",
    group: "layout",
    capability: "universal",
  },
  {
    id: "icon",
    group: "text",
    capability: "universal",
  },
  {
    id: "image",
    group: "text",
    capability: "universal",
  },
  {
    id: "image-background",
    group: "text",
    capability: "universal",
  },
  {
    id: "image-viewer",
    group: "text",
    capability: "universal",
  },
  {
    id: "input",
    group: "controls",
    capability: "universal",
  },
  {
    id: "input-accessory-view",
    group: "platform",
    capability: "ios-only",
  },
  {
    id: "keyboard-avoiding-view",
    group: "platform",
    capability: "universal",
  },
  {
    id: "link",
    group: "controls",
    capability: "universal",
  },
  {
    id: "liquid-glass",
    group: "platform",
    capability: "ios-glass-with-panel-fallback",
  },
  {
    id: "menu",
    group: "navigation",
    capability: "universal",
  },
  {
    id: "modal",
    group: "overlays",
    capability: "universal",
  },
  {
    id: "popover",
    group: "overlays",
    capability: "universal",
  },
  {
    id: "portal",
    group: "overlays",
    capability: "universal",
  },
  {
    id: "pressable",
    group: "controls",
    capability: "universal",
  },
  {
    id: "progress",
    group: "feedback",
    capability: "universal",
  },
  {
    id: "radio",
    group: "controls",
    capability: "universal",
  },
  {
    id: "refresh-control",
    group: "lists",
    capability: "universal",
  },
  {
    id: "safe-area-view",
    group: "platform",
    capability: "universal",
  },
  {
    id: "scroll-view",
    group: "lists",
    capability: "universal",
  },
  {
    id: "section-list",
    group: "lists",
    capability: "universal",
  },
  {
    id: "select",
    group: "controls",
    capability: "universal",
  },
  {
    id: "skeleton",
    group: "feedback",
    capability: "universal",
  },
  {
    id: "slider",
    group: "controls",
    capability: "universal",
  },
  {
    id: "spinner",
    group: "feedback",
    capability: "universal",
  },
  {
    id: "status-bar",
    group: "platform",
    capability: "universal",
  },
  {
    id: "switch",
    group: "controls",
    capability: "universal",
  },
  {
    id: "table",
    group: "lists",
    capability: "universal",
  },
  {
    id: "tabs",
    group: "navigation",
    capability: "universal",
  },
  {
    id: "text",
    group: "text",
    capability: "universal",
  },
  {
    id: "textarea",
    group: "controls",
    capability: "universal",
  },
  {
    id: "toast",
    group: "feedback",
    capability: "universal",
  },
  {
    id: "tooltip",
    group: "overlays",
    capability: "universal",
  },
  {
    id: "view",
    group: "layout",
    capability: "universal",
  },
  {
    id: "virtualized-list",
    group: "lists",
    capability: "universal",
  },
  {
    id: "vstack",
    group: "layout",
    capability: "universal",
  },
] as const;
export type ComponentId = (typeof componentCatalog)[number]["id"];
export type ComponentGroup = (typeof componentCatalog)[number]["group"];
