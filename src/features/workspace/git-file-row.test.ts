import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import type { GitChangedFile } from "./wire";
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("lucide-react-native/icons/minus", () => ({ default: "Minus" }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: "Plus" }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/i18n", () => ({ useLocale: () => "de" }));
vi.mock("@/ui/primitives", () => ({ StatusText: "StatusText", Body: "Body", IconButton: "IconButton", PressableCard: "PressableCard" }));
import { GitFileRow } from "./git-file-row";

function nodes(node: ReactNode): ReactElement<Record<string, any>>[] {
  return isValidElement<Record<string, any>>(node)
    ? [node, ...Children.toArray(node.props.children).flatMap(nodes)] : [];
}

it("formats large Git change totals in the selected locale without coupling preview and stage", () => {
  const onStage = vi.fn(), onPreview = vi.fn();
  const file = { relative: "src/internationalization/Benachrichtigungseinstellungen.tsx", status: "M", additions: 1284, deletions: 1000000 } as GitChangedFile;
  const rendered = nodes(GitFileRow({ file, staged: false, busy: false, onPreview, onStage }));
  const text = rendered.flatMap(node => Children.toArray(node.props.children).filter(child => typeof child === "string")).join(" ");
  expect(text).toContain("+1.284");
  expect(text).toContain("−1.000.000");
  const stage = rendered.find(node => node.type === "IconButton")!;
  expect(stage.props.label).toContain(file.relative);
  stage.props.onPress();
  expect(onStage).toHaveBeenCalledOnce();
  expect(onPreview).not.toHaveBeenCalled();
});
