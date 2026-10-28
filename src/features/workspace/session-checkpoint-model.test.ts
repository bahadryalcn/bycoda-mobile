import { describe, expect, it } from "vitest";
import {
  checkpointChange,
  checkpointRead,
  checkpointReviewMatches,
  reviewRewind,
  rewindCommand,
  validateCheckpointDiff,
  validateCheckpointStatus,
} from "./session-checkpoint-model";
import type { HostSession } from "./wire";
const target = { machineId: "machine", sessionId: "session", cwd: "/worktree" };
const file = {
  path: "/worktree/a",
  relative: "a",
  status: "modified",
  additions: 1,
  deletions: 1,
  exact: true,
  undoable: true,
};
it.each([undefined, 2])(
  "retains the reviewed rewind generation %s when same-revision authority changes",
  (authorityGeneration) => {
    const reviewed = reviewRewind({ ...session, authorityGeneration }, "turn");
    const command = rewindCommand({ ...session, authorityGeneration: 3 }, reviewed);
    expect(command.authorityGeneration).toBe(authorityGeneration);
    expect(Object.hasOwn(command, "authorityGeneration")).toBe(true);
  },
);
const session = {
  revision: 3,
  status: "idle",
  session: {
    id: "session",
    cwd: "/project",
    worktreeCwd: "/worktree",
    blocks: [
      { id: "before", role: "user", text: "kept" },
      { id: "turn", role: "user", text: "removed prompt", providerTurnId: "provider-turn" },
      { id: "answer", role: "assistant", text: "removed response" },
    ],
  },
} as unknown as HostSession;
describe("session checkpoint and rewind review", () => {
  it("keeps checkpoint commands distinct from Git discard and binds file/session/worktree/token", () => {
    expect(checkpointRead(target, "a")).toEqual({
      command: "session_checkpoint_file_diff",
      args: { sessionId: "session", cwd: "/worktree", relative: "a" },
    });
    expect(
      checkpointChange(target, { files: [file], expectedCheckpoint: "a".repeat(64) }, "a", true),
    ).toEqual({
      command: "session_checkpoint_undo",
      args: {
        sessionId: "session",
        cwd: "/worktree",
        relative: "a",
        expectedCheckpoint: "a".repeat(64),
      },
    });
    expect(
      checkpointChange(target, { files: [file], expectedCheckpoint: "a".repeat(64) }, "a", false)
        .command,
    ).toBe("session_checkpoint_keep");
  });
  it("blocks unguarded old-host writes, missing files and unsafe undo", () => {
    expect(() => checkpointChange(target, { files: [file] }, "a", true)).toThrow();
    expect(() =>
      checkpointChange(
        target,
        { files: [file], expectedCheckpoint: "a".repeat(64) },
        "missing",
        false,
      ),
    ).toThrow();
    expect(() =>
      checkpointChange(
        target,
        { files: [{ ...file, undoable: false }], expectedCheckpoint: "a".repeat(64) },
        "a",
        true,
      ),
    ).toThrow();
    expect(() => validateCheckpointStatus({ files: [{}] })).toThrow();
  });
  it("previews exactly the removed suffix and binds rewind to revision and worktree", () => {
    const review = reviewRewind(session, "turn");
    expect(review.affectedIds).toEqual(["turn", "answer"]);
    expect(rewindCommand(session, review)).toEqual({
      type: "rewind",
      sessionId: "session",
      blockId: "turn",
      expectedRevision: 3,
    });
    expect(() => rewindCommand({ ...session, revision: 4 }, review)).toThrow("changed");
    expect(() =>
      rewindCommand({ ...session, session: { ...session.session, id: "other" } }, review),
    ).toThrow("changed");
    expect(() =>
      rewindCommand({ ...session, session: { ...session.session, worktreeCwd: "/other" } }, review),
    ).toThrow("changed");
  });
  it("requires status and file preview from the same captured checkpoint", () => {
    const status = { files: [file], expectedCheckpoint: "a".repeat(64) };
    const diff = validateCheckpointDiff(
      {
        relative: "a",
        original: "before",
        current: "after",
        binary: false,
        tooLarge: false,
        expectedCheckpoint: "a".repeat(64),
      },
      "a",
    );
    expect(checkpointReviewMatches(status, diff)).toBe(true);
    expect(checkpointReviewMatches(status, { ...diff, expectedCheckpoint: "b".repeat(64) })).toBe(
      false,
    );
    expect(checkpointReviewMatches(status, { ...diff, expectedCheckpoint: undefined })).toBe(false);
    expect(() => validateCheckpointDiff({ ...diff, relative: "other" }, "a")).toThrow();
    expect(() => validateCheckpointDiff({ ...diff, current: {} }, "a")).toThrow();
  });
  it("uses canonical running, queued, draft and internal turn guards", () => {
    expect(() => reviewRewind({ ...session, status: "running" }, "turn")).toThrow();
    expect(() =>
      reviewRewind(
        {
          ...session,
          session: { ...session.session, queuedMessages: [{ id: "queued" }] as never },
        },
        "turn",
      ),
    ).toThrow();
    expect(() => reviewRewind(session, "answer")).toThrow();
  });
});
