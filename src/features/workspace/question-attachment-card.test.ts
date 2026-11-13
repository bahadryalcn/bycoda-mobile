// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { HostTransport } from "@/remote/transport";
import type { QuestionCardProps } from "./session-types";
import { RemoteHostError } from "@/remote/host-error";
import { QuestionAttachmentCard } from "./question-attachment-card";

const f = vi.hoisted(() => ({ data: new Map<string, string>(), pick: vi.fn(), upload: vi.fn(), stage: vi.fn(async () => {}), remove: vi.fn(), props: undefined as QuestionCardProps | undefined }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => f.data.get(key) ?? null,
  setItem: async (key: string, value: string) => { f.data.set(key, value); },
} }));
vi.mock("./attachment-files", () => ({ pickAttachments: f.pick, removeStagedFile: f.remove }));
vi.mock("./attachment-transfer", () => ({ uploadAttachment: f.upload }));
vi.mock("./attachment-ownership", () => ({ supportsAttachmentOwnership: () => true, attachmentReleases: { prepare: async () => "cccccccc-cccc-4ccc-8ccc-cccccccccccc", stage: f.stage, flush: async () => {} } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({
  Stack: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Row: ({ children }: PropsWithChildren) => createElement("div", null, children),
  ErrorText: ({ error }: { error: unknown }) => error ? createElement("p", null, String(error)) : null,
  Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label),
}));
vi.mock("./composer-attachments", () => ({ ComposerAttachments: ({ files, onRemove, onRetry }: {
  files: { id: string; name: string }[]; onRemove: (file: unknown) => void; onRetry: (file: unknown) => void;
}) => createElement("div", null, files.map(file => createElement("div", { key: file.id }, file.name,
  createElement("button", { onClick: () => onRemove(file) }, `Remove ${file.name}`), createElement("button", { onClick: () => onRetry(file) }, `Retry ${file.name}`)))) }));
vi.mock("./question-card", () => ({ QuestionCard: (props: QuestionCardProps) => {
  f.props = props;
  return createElement("div", null, props.question.delivery,
    props.question.questions.map(item => createElement("section", { key: item.id, "data-item": item.id }, props.attachmentControls?.(item.id, !!props.attachmentBusy))),
    createElement("button", { onClick: () => { void props.submitAnswer?.({ kind: "answered", answers: {} }, { answers: {}, custom: {} }).catch(() => {}); } }, "Send"));
} }));
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); vi.unstubAllGlobals(); });
it("mounts actual pick/upload/remove/retry owners and restores unknown delivery after navigation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  const client = { machine: { id: "mounted-machine", environmentId: "env" }, assertCurrentAccess: vi.fn() } as unknown as HostTransport;
  const file = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "proof.png", mimeType: "image/png", kind: "image", size: 4, uri: "file:///private/question-drafts/proof" };
  f.pick.mockResolvedValue([file]); f.upload.mockRejectedValueOnce(new Error("upload failed")).mockResolvedValue(file);
  const onAnswer = vi.fn().mockRejectedValue(new RemoteHostError(client.machine.id, "timeout", "unknown", true));
  const props = { client, scope: { machineId: client.machine.id, sessionId: "s" }, draftScope: "mounted-scope", disabled: false, onAnswer,
    question: { requestId: 1, occurrenceId: "mounted", questions: [{ id: "one", prompt: "One", allowCustom: true, multiSelect: false, options: [] }, { id: "typed", prompt: "Typed", allowCustom: true, multiSelect: false, preserveCustomWhitespace: true, options: [] }] } };
  const render = async () => { await act(async () => root!.render(createElement(QuestionAttachmentCard, props))); };
  await render();
  expect(container.querySelector('[data-item="typed"]')?.textContent).toBe("");
  const click = async (text: string) => { await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === text)!.click()); };
  await click("Attach file");
  expect(f.pick).toHaveBeenCalledWith("document", "mounted-machine:s", "question");
  expect(container.textContent).toContain("proof.png");
  await click("Retry proof.png"); expect(f.props?.attachmentBusy).toBe(false);
  await click("Retry proof.png"); expect(f.upload).toHaveBeenCalledTimes(2);
  await click("Remove proof.png"); expect(f.stage).toHaveBeenCalled(); expect(f.props?.attachments?.one).toEqual([]);
  await click("Photos");
  await act(async () => {
    await expect(f.props!.submitAnswer!({ kind: "answered", answers: {} }, { answers: {}, custom: { typed: "value" } })).rejects.toThrow("unknown");
  });
  expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ attachments: { one: [{ id: file.id, name: "proof.png", size: 4, mimeType: "image/png", kind: "image" }] } }));
  await act(async () => root!.unmount()); root = createRoot(container); await render();
  expect(f.props?.question.delivery).toBe("unknown");
  await act(async () => { await expect(f.props!.submitAnswer!({ kind: "answered", answers: {} }, { answers: {}, custom: {} })).rejects.toThrow(); });
  expect(onAnswer).toHaveBeenCalledOnce();
});
