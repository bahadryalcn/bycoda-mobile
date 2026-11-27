import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { LegalScreen } from "./legal-screen";

const navigation = vi.hoisted(() => ({ canGoBack: vi.fn(), back: vi.fn(), replace: vi.fn(), dismissTo: vi.fn() }));
vi.mock("expo-router", () => ({ router: navigation, Stack: { Screen: "stack-screen" }, useLocalSearchParams: () => ({ document: "unknown-document" }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({ Body: "body", Button: "button", Card: "card", Empty: "empty", Screen: "screen" }));
vi.mock("./legal-document", () => ({ isLegalDocument: () => false }));
vi.mock("./legal-reader", () => ({ LegalReader: "legal-reader" }));
beforeEach(() => vi.clearAllMocks());

it.each([true, false])("recovers an unknown legal document (history: %s)", (history) => {
  navigation.canGoBack.mockReturnValue(history);
  const screen = LegalScreen() as ReactElement<{ children: ReactElement[] }>;
  const empty = screen.props.children.find((child) => child.type === "empty") as ReactElement<{ action: { onPress: () => void } }>;
  empty.props.action.onPress();
  if (history) { expect(navigation.back).toHaveBeenCalledOnce(); expect(navigation.dismissTo).not.toHaveBeenCalled(); }
  // Without history the document returns to Settings, where legal documents are listed.
  else { expect(navigation.back).not.toHaveBeenCalled(); expect(navigation.dismissTo).toHaveBeenCalledWith("/settings"); }
});
