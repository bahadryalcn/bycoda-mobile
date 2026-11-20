import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ProjectIcon } from "./project-icon";

vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: { muted: "#888" } }) }));
vi.mock("./duotone-icon", () => ({ Folder: () => null, Layers: () => null }));
vi.mock("lucide-react-native/icons/folder", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/layers", () => ({ default: () => null }));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => children }));
vi.mock("react-native-svg", () => {
  const Group = ({ children }: PropsWithChildren) => children;
  return {
    default: Group, ClipPath: Group, Defs: Group, G: Group, LinearGradient: Group,
    Path: () => createElement("span", { "data-path": true }),
    Pattern: Group, Rect: () => null, Stop: () => null,
    Text: ({ children }: PropsWithChildren) => createElement("span", { "data-texture": true }, children),
  };
});

it("keeps the custom shape but skips all texture text at list-row sizes", () => {
  const appearance = { icon: { path: "M1 1H23V23H1Z", highlight: "#eee" } };
  const row = renderToStaticMarkup(createElement(ProjectIcon, { appearance }));
  expect(row).toContain("data-path");
  expect(row).not.toContain("data-texture");
  const preview = renderToStaticMarkup(createElement(ProjectIcon, { appearance, size: 32 }));
  expect(preview.match(/data-texture/g)).toHaveLength(6);
});
