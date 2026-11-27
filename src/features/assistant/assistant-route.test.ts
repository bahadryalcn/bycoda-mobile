// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  params: {} as { voice?: string | string[]; job?: string; questions?: string },
  screen: vi.fn(),
  options: vi.fn(),
}));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => f.params, Stack: { Screen: ({ options }: { options: unknown }) => { f.options(options); return null; } } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/features/assistant/assistant-screen", () => ({ AssistantScreen: (props: unknown) => { f.screen(props); return null; } }));
import AssistantRoute from "../../../app/assistant";
it("wires the dock navigation contract without dropping a focused job", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  try {
    f.params = { voice: "1", job: "job-1" }; await act(async () => root.render(h(AssistantRoute)));
    expect(f.screen).toHaveBeenLastCalledWith({ voiceRequested: true, focusJobId: "job-1", focusQuestions: false });
    f.params = {}; await act(async () => root.render(h(AssistantRoute)));
    expect(f.screen).toHaveBeenLastCalledWith({ voiceRequested: false, focusJobId: undefined, focusQuestions: false });
    // The screen owns the title and the top row's actions, so the route sets no competing screen options.
    expect(f.options).not.toHaveBeenCalled();
    // A tapped "questions waiting" push opens the home with its questions in view.
    f.params = { questions: "1" };
    await act(async () => root.render(h(AssistantRoute)));
    expect(f.screen).toHaveBeenLastCalledWith({ voiceRequested: false, focusJobId: undefined, focusQuestions: true });
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
