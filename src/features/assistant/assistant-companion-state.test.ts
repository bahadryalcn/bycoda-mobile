import { beforeEach, expect, it } from "vitest";
import { bindAssistantVoicePort, closeAssistantCompanion, interruptAssistantVoice, minimizeAssistantCompanion, openAssistantCompanion, useAssistantCompanion } from "./assistant-companion-state";

beforeEach(() => { useAssistantCompanion.setState({ transcript: undefined }); closeAssistantCompanion(); });
it("reports an interrupted active binding but cannot retire a newer binding from stale cleanup", () => {
  const source = () => ({ machineId: "host-a", environmentId: "env-a", port: { current: () => true, request: async <T,>() => ({} as T) } });
  const releaseOld = bindAssistantVoicePort(source());
  const releaseNew = bindAssistantVoicePort(source());
  useAssistantCompanion.setState({ voice: "preparing" });
  releaseOld();
  expect(useAssistantCompanion.getState().voice).toBe("preparing");
  releaseNew();
  expect(useAssistantCompanion.getState().voice).toBe("idle");
  expect((useAssistantCompanion.getState().error as Error).message).toContain("connection changed");
});
it("explains permission-window interruption without resuming or discarding the target", () => {
  openAssistantCompanion("host-a", "env-a");
  useAssistantCompanion.setState({ voice: "preparing", thread: { id: "room-a" } as never });
  interruptAssistantVoice();
  expect(useAssistantCompanion.getState().error).toBeInstanceOf(Error);
  expect((useAssistantCompanion.getState().error as Error).message).toContain("try again");
  expect(useAssistantCompanion.getState().thread?.id).toBe("room-a");
  closeAssistantCompanion();
  interruptAssistantVoice();
  expect(useAssistantCompanion.getState().error).toBeUndefined();
});
it("retains the original Room selection while minimized and expanded", () => {
  openAssistantCompanion("host-a", "env-a");
  useAssistantCompanion.setState({ projectId: "project-a", thread: { id: "room-a" } as never });
  minimizeAssistantCompanion();
  expect(useAssistantCompanion.getState()).toMatchObject({ mode: "minimized", projectId: "project-a", thread: { id: "room-a" } });
  openAssistantCompanion("host-a", "env-a");
  expect(useAssistantCompanion.getState()).toMatchObject({ mode: "full", thread: { id: "room-a" } });
});
it("never carries a Room selection or recognized private text into another computer", () => {
  openAssistantCompanion("host-a", "env-a");
  useAssistantCompanion.setState({ projectId: "project-a", thread: { id: "room-a" } as never,
    transcript: { id: "speech-a", target: { machineId: "host-a", environmentId: "env-a", threadId: "room-a" }, text: "private" } });
  openAssistantCompanion("host-a", "replacement-env");
  expect(useAssistantCompanion.getState()).toMatchObject({ thread: null, projectId: "", environmentId: "replacement-env" });
  expect(useAssistantCompanion.getState().transcript).toMatchObject({ target: { machineId: "host-a", environmentId: "env-a", threadId: "room-a" }, text: "private" });
  closeAssistantCompanion();
  expect(useAssistantCompanion.getState()).toMatchObject({ mode: "closed", voice: "idle", machineId: "" });
  expect(useAssistantCompanion.getState().transcript?.text).toBe("private");
});
