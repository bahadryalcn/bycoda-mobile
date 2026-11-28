import { describe, expect, it } from "vitest";
import {
  NEW_CHAT_DRAFT_KEY,
  createNewChatSendGate,
  newChatAttempt,
  newChatCheckoutAvailable,
  newChatRouteKey,
  newChatRuntimeMode,
  newChatAttemptKey,
  newChatContextSources,
  newChatDraftWasSent,
  newChatFirstTurn,
  newChatPinnedContext,
  newChatSendState,
  newChatSessionOnlyInput,
  newChatSuggestions,
  newChatTurn,
  seededNewChatText,
  newChatWorktreeCwd,
  resolveNewChatProject,
  type NewChatPayload,
} from "./new-chat-model";
import type { ComposerSuggestion } from "./composer-catalog-model";

const alpha = { id: "alpha", cwd: "/work/alpha" };
const beta = { id: "beta", cwd: "/work/beta" };
const gamma = { id: "gamma", cwd: "/work/gamma" };
const recency = { activity: { beta: 20 }, opened: { gamma: 10 } };
// Visible projects, most recent first (the screen orders them with orderProjectsByRecency).
const projects = [beta, gamma, alpha];

describe("resolveNewChatProject", () => {
  const base = { machineId: "pc-1", projects, recency, useLast: false };

  it("keeps the owner's pick on the same computer", () => {
    expect(resolveNewChatProject({ ...base, picked: { machineId: "pc-1", id: "alpha", cwd: alpha.cwd } })).toBe(alpha);
  });

  it("prefers the route project of this computer, then the shared selection", () => {
    expect(resolveNewChatProject({ ...base, route: { machineId: "pc-1", projectId: "gamma" }, scopeProjectId: "alpha" })).toBe(gamma);
    expect(resolveNewChatProject({ ...base, route: { machineId: "pc-2", projectId: "gamma" }, scopeProjectId: "alpha" })).toBe(alpha);
    expect(resolveNewChatProject({ ...base, route: { projectId: "gamma" } })).toBe(gamma);
  });

  it("asks for a project when nothing names one and the last project is not preferred", () => {
    expect(resolveNewChatProject(base)).toBeUndefined();
    expect(resolveNewChatProject({ ...base, useLast: true })).toBe(beta);
  });

  it("after a computer switch keeps the same folder, else falls back to that computer's recent project", () => {
    const onOther = [{ id: "x-alpha", cwd: "/work/alpha/" }, { id: "x-delta", cwd: "/work/delta" }];
    const picked = { machineId: "pc-1", id: "alpha", cwd: "/work/alpha" };
    expect(resolveNewChatProject({ ...base, machineId: "pc-2", projects: onOther, recency: { activity: {}, opened: {} }, picked }))
      .toEqual(onOther[0]);
    const missing = { machineId: "pc-1", id: "beta", cwd: "/work/beta" };
    const delta = [{ id: "x-delta", cwd: "/work/delta" }, { id: "x-omega", cwd: "/work/omega" }];
    expect(resolveNewChatProject({
      ...base, machineId: "pc-2", projects: delta, recency: { activity: { "x-omega": 5 }, opened: {} }, picked: missing,
    })).toEqual(delta[1]);
    // No recency at all on the new computer: its first visible project, never nothing.
    expect(resolveNewChatProject({ ...base, machineId: "pc-2", projects: delta, recency: { activity: {}, opened: {} }, picked: missing }))
      .toEqual(delta[0]);
  });

  it("uses the new computer's shared selection before its recent project", () => {
    const delta = [{ id: "x-delta", cwd: "/work/delta" }, { id: "x-omega", cwd: "/work/omega" }];
    expect(resolveNewChatProject({
      ...base, machineId: "pc-2", projects: delta, recency: { activity: { "x-delta": 5 }, opened: {} },
      picked: { machineId: "pc-1", id: "beta", cwd: "/work/beta" }, scopeProjectId: "x-omega",
    })).toEqual(delta[1]);
  });

  it("has nothing to offer without a computer or projects", () => {
    expect(resolveNewChatProject({ ...base, machineId: undefined })).toBeUndefined();
    expect(resolveNewChatProject({ ...base, projects: [], useLast: true })).toBeUndefined();
  });
});

describe("newChatWorktreeCwd", () => {
  it("sends only a worktree of the selected project other than its main folder", () => {
    expect(newChatWorktreeCwd(alpha, { projectId: "alpha", cwd: "/work/alpha-feature" })).toBe("/work/alpha-feature");
    expect(newChatWorktreeCwd(alpha, { projectId: "alpha", cwd: "/work/alpha/" })).toBeUndefined();
    expect(newChatWorktreeCwd(beta, { projectId: "alpha", cwd: "/work/alpha-feature" })).toBeUndefined();
    expect(newChatWorktreeCwd(undefined, { projectId: "alpha", cwd: "/x" })).toBeUndefined();
    expect(newChatWorktreeCwd(alpha, undefined)).toBeUndefined();
  });
});

describe("send attempts", () => {
  const payload: NewChatPayload = {
    machineId: "pc-1", projectId: "alpha", provider: "codex", model: "gpt", settings: { effort: "high", fast: "on" },
    runtimeMode: "supervised", text: "Fix the build", firstTurn: true,
  };
  const ids = () => {
    let next = 0;
    return () => `id-${++next}`;
  };

  it("reuses command IDs for an unchanged payload so a resend is idempotent", () => {
    const make = ids();
    const first = newChatAttempt(undefined, newChatAttemptKey(payload), make);
    const again = newChatAttempt(first, newChatAttemptKey({ ...payload, settings: { fast: "on", effort: "high" } }), make);
    expect(again).toBe(first);
    expect(first.createId).not.toBe(first.turnId);
  });

  it("gets fresh IDs once anything the Host receives changes", () => {
    const make = ids();
    const first = newChatAttempt(undefined, newChatAttemptKey(payload), make);
    for (const change of [
      { text: "Fix the tests" }, { projectId: "beta" }, { machineId: "pc-2" }, { cwd: "/work/alpha-feature" },
      { model: "other" }, { runtimeMode: "full-access" as const }, { settings: { effort: "low" } }, { firstTurn: false },
      { attachments: ["file-1"] }, { turn: "plan" as const }, { turn: "draft" as const },
    ]) {
      const next = newChatAttempt(first, newChatAttemptKey({ ...payload, ...change }), make);
      expect(next.createId).not.toBe(first.createId);
      expect(next.turnId).not.toBe(first.turnId);
    }
  });

  it("keeps the IDs for the same attachments and renews them for a changed set", () => {
    const make = ids();
    const withFiles = { ...payload, attachments: ["file-1", "file-2"] };
    const first = newChatAttempt(undefined, newChatAttemptKey(withFiles), make);
    expect(newChatAttempt(first, newChatAttemptKey({ ...withFiles, attachments: ["file-1", "file-2"] }), make)).toBe(first);
    expect(newChatAttempt(first, newChatAttemptKey({ ...withFiles, attachments: ["file-1"] }), make)).not.toBe(first);
    // No attachments reads the same as an empty list.
    expect(newChatAttemptKey({ ...payload, attachments: [] })).toBe(newChatAttemptKey(payload));
  });

  it("renews the IDs when only the mode changes, so Send again never replays a different turn", () => {
    const make = ids();
    // The screen keys the trimmed draft and its mode; the mode is what tells the turns apart.
    const plain = { ...payload, text: "Fix the build" };
    const first = newChatAttempt(undefined, newChatAttemptKey({ ...plain, turn: "plan" }), make);
    expect(newChatAttempt(first, newChatAttemptKey({ ...plain, turn: "plan" }), make)).toBe(first);
    expect(newChatAttempt(first, newChatAttemptKey({ ...plain, turn: "draft" }), make)).not.toBe(first);
    expect(newChatAttempt(first, newChatAttemptKey({ ...plain, turn: "send" }), make)).not.toBe(first);
    // No mode reads the same as a plain send.
    expect(newChatAttemptKey({ ...plain, turn: "send" })).toBe(newChatAttemptKey(plain));
  });

  it("builds the nested first turn the Host contract accepts", () => {
    expect(newChatFirstTurn("Hello", "turn-1")).toEqual({ type: "send", commandId: "turn-1", sessionId: "", text: "Hello" });
    expect(newChatFirstTurn("Hello", "turn-1", [])).toEqual({ type: "send", commandId: "turn-1", sessionId: "", text: "Hello" });
  });

  it("carries uploaded attachments in the first turn", () => {
    const file = { id: "f-1", name: "shot.png", mimeType: "image/png", kind: "image" as const, size: 12 };
    expect(newChatFirstTurn("", "turn-1", [file])).toEqual({
      type: "send", commandId: "turn-1", sessionId: "", text: "", attachments: [file],
    });
  });

  it("produces a create the shared Host contract accepts, attachments included", async () => {
    const { CommandDispatchParamsSchema } = await import("../../../../src/shared/model/host-contracts/session-commands");
    const file = { id: "f-1", name: "notes.md", mimeType: "text/markdown", kind: "file" as const, size: 3 };
    const create = {
      type: "create", commandId: "create-1", projectId: "alpha", harness: "codex", model: "gpt", runtimeMode: "supervised",
      firstTurn: newChatFirstTurn("Read this", "turn-1", [file]),
    };
    expect(CommandDispatchParamsSchema.parse(create)).toEqual(create);
  });

  it("sends Plan mode with the plan intent and Save as draft as the Host draft command", () => {
    expect(newChatFirstTurn("Add a cache", "turn-1", [], "plan")).toEqual({
      type: "send", commandId: "turn-1", sessionId: "", text: "Add a cache", intent: "plan",
    });
    const file = { id: "f-1", name: "shot.png", mimeType: "image/png", kind: "image" as const, size: 12 };
    expect(newChatFirstTurn("Later", "turn-1", [file], "draft")).toEqual({
      type: "draft", commandId: "turn-1", sessionId: "", text: "Later", attachments: [file],
    });
    expect(newChatFirstTurn("Go", "turn-1", [], "send")).toEqual(newChatFirstTurn("Go", "turn-1"));
  });

  it("produces plan and draft creates the shared Host contract accepts", async () => {
    const { CommandDispatchParamsSchema } = await import("../../../../src/shared/model/host-contracts/session-commands");
    const base = { type: "create", commandId: "create-1", projectId: "alpha", harness: "claude", model: "opus", runtimeMode: "supervised" };
    for (const kind of ["plan", "draft"] as const) {
      const create = { ...base, firstTurn: newChatFirstTurn("Add a cache", "turn-1", [], kind) };
      expect(CommandDispatchParamsSchema.parse(create)).toEqual(create);
    }
  });
});

describe("first-turn reference context", () => {
  const payload: NewChatPayload = {
    machineId: "pc-1", projectId: "alpha", provider: "codex", model: "gpt", settings: {},
    runtimeMode: "supervised", text: "Fix @github:#12 per @notes:plan", firstTurn: true,
  };
  const context = 'REFERENCED NOTES (reference data):\n{"mention":"@notes:plan"}';
  const ids = () => {
    let next = 0;
    return () => `id-${++next}`;
  };
  const both = ["inbox.providers.desktop", "sessions.noteContext.v1"];

  it("resolves notes and work items for plain and Plan sends the computer supports", () => {
    expect(newChatContextSources("Fix @github:#12", "send", both)).toEqual({ workItems: true, notes: true });
    expect(newChatContextSources("/plan Fix @notes:plan", "plan", both)).toEqual({ workItems: true, notes: true });
    expect(newChatContextSources("Fix @notes:plan", "send", ["sessions.noteContext.v1"])).toEqual({ workItems: false, notes: true });
    expect(newChatContextSources("Fix @github:#12", "send", ["inbox.providers.desktop"])).toEqual({ workItems: true, notes: false });
    expect(newChatContextSources("Fix @github:#12", "send", undefined)).toEqual({ workItems: false, notes: false });
  });

  it("leaves drafts, provider slash commands and mention-free words unresolved", () => {
    const none = { workItems: false, notes: false };
    expect(newChatContextSources("/draft Fix @notes:plan", "draft", both)).toEqual(none);
    expect(newChatContextSources("/review @notes:plan", "send", both)).toEqual(none);
    expect(newChatContextSources("Fix the build", "send", both)).toEqual(none);
  });

  it("carries the context on plain and Plan first turns, never on a draft", () => {
    expect(newChatFirstTurn("Fix it", "turn-1", [], "send", context)).toEqual({
      type: "send", commandId: "turn-1", sessionId: "", text: "Fix it", contextReplay: context,
    });
    expect(newChatFirstTurn("Fix it", "turn-1", [], "plan", context)).toEqual({
      type: "send", commandId: "turn-1", sessionId: "", text: "Fix it", intent: "plan", contextReplay: context,
    });
    expect(newChatFirstTurn("Later", "turn-1", [], "draft", context)).toEqual({
      type: "draft", commandId: "turn-1", sessionId: "", text: "Later",
    });
    expect(newChatFirstTurn("Go", "turn-1", [], "send", "")).toEqual(newChatFirstTurn("Go", "turn-1"));
  });

  it("produces send and plan creates with context the shared Host contract accepts", async () => {
    const { CommandDispatchParamsSchema } = await import("../../../../src/shared/model/host-contracts/session-commands");
    const base = { type: "create", commandId: "create-1", projectId: "alpha", harness: "codex", model: "gpt", runtimeMode: "supervised" };
    for (const kind of ["send", "plan"] as const) {
      const create = { ...base, firstTurn: newChatFirstTurn("Fix it", "turn-1", [], kind, context) };
      expect(CommandDispatchParamsSchema.parse(create)).toEqual(create);
    }
  });

  it("keys the context, so different reference data never reuses the command IDs", () => {
    const make = ids();
    const first = newChatAttempt(undefined, newChatAttemptKey({ ...payload, contextReplay: context }), make, context);
    expect(first.contextReplay).toBe(context);
    expect(newChatAttemptKey({ ...payload, contextReplay: "" })).toBe(newChatAttemptKey(payload));
    const other = newChatAttempt(first, newChatAttemptKey({ ...payload, contextReplay: `${context}!` }), make, `${context}!`);
    expect(other.createId).not.toBe(first.createId);
  });

  it("pins the resolved context for a resend of the same payload, and re-resolves after a change", () => {
    const make = ids();
    expect(newChatPinnedContext(undefined, payload)).toBeUndefined();
    const first = newChatAttempt(undefined, newChatAttemptKey({ ...payload, contextReplay: context }), make, context);
    const pinned = newChatPinnedContext(first, payload);
    expect(pinned).toEqual({ contextReplay: context });
    // The resend keys the pinned context and gets the same attempt back.
    expect(newChatAttempt(first, newChatAttemptKey({ ...payload, ...pinned }), make, pinned?.contextReplay)).toBe(first);
    expect(newChatPinnedContext(first, { ...payload, text: "Fix @github:#13" })).toBeUndefined();
    expect(newChatPinnedContext(first, { ...payload, projectId: "beta" })).toBeUndefined();
    // A payload that resolved nothing is pinned as nothing, not resolved again.
    const empty = newChatAttempt(undefined, newChatAttemptKey(payload), make);
    expect(newChatPinnedContext(empty, payload)).toEqual({});
  });
});

describe("newChatTurn", () => {
  it("reads the leading mode command and strips it from the words sent", () => {
    expect(newChatTurn("/plan  Add a cache ")).toEqual({ kind: "plan", body: "Add a cache" });
    expect(newChatTurn("  /DRAFT later")).toEqual({ kind: "draft", body: "later" });
    expect(newChatTurn("/plan")).toEqual({ kind: "plan", body: "" });
    expect(newChatTurn(" Fix it ")).toEqual({ kind: "send", body: "Fix it" });
  });

  it("leaves look-alikes and mid-text commands as plain words", () => {
    for (const text of ["/planning notes", "use /plan later", "/drafts"])
      expect(newChatTurn(text)).toEqual({ kind: "send", body: text });
  });
});

describe("newChatSendState", () => {
  const ready = { text: "Go", project: true, canStart: true, locked: false, connected: true };
  it("enables Send only with words, a project, a model, a connection and no create in flight", () => {
    expect(newChatSendState(ready)).toEqual({ enabled: true });
    expect(newChatSendState({ ...ready, text: "   " }).reason).toBe("empty");
    expect(newChatSendState({ ...ready, project: false }).reason).toBe("project");
    expect(newChatSendState({ ...ready, canStart: false }).reason).toBe("model");
    expect(newChatSendState({ ...ready, connected: false }).reason).toBe("offline");
    expect(newChatSendState({ ...ready, locked: true }).reason).toBe("busy");
  });

  it("sends attachments without words, as an open session does, but never while they upload", () => {
    expect(newChatSendState({ ...ready, text: "", attachments: 1 })).toEqual({ enabled: true });
    expect(newChatSendState({ ...ready, text: "", attachments: 0 }).reason).toBe("empty");
    expect(newChatSendState({ ...ready, attachments: 1, uploading: true })).toEqual({ enabled: false, reason: "busy" });
    // Attachment-only sends still need a project and a model.
    expect(newChatSendState({ ...ready, text: "", attachments: 1, canStart: false }).reason).toBe("model");
    expect(newChatSendState({ ...ready, text: "", attachments: 1, project: false }).reason).toBe("project");
  });

  it("holds Send for input only an open session can resolve", () => {
    expect(newChatSendState({ ...ready, sessionOnly: "command" })).toEqual({ enabled: false, reason: "command" });
    expect(newChatSendState({ ...ready, sessionOnly: "crew" }).reason).toBe("crew");
    // An empty draft still reads as empty, not as a blocked command.
    expect(newChatSendState({ ...ready, text: " ", sessionOnly: "command" }).reason).toBe("empty");
  });

  it("needs something to plan, and words or a file to save as a draft", () => {
    expect(newChatSendState({ ...ready, text: "/plan Add a cache" })).toEqual({ enabled: true });
    expect(newChatSendState({ ...ready, text: "/plan " }).reason).toBe("empty");
    expect(newChatSendState({ ...ready, text: "/plan", attachments: 1 }).reason).toBe("empty");
    expect(newChatSendState({ ...ready, text: "/draft later" })).toEqual({ enabled: true });
    expect(newChatSendState({ ...ready, text: "/draft" }).reason).toBe("empty");
    expect(newChatSendState({ ...ready, text: "/draft", attachments: 1 })).toEqual({ enabled: true });
  });
});

describe("session-only input", () => {
  it("finds commands that act on an existing conversation, and crew delegations", () => {
    for (const text of ["/compact", "  /compact now", "/BTW why?"])
      expect(newChatSessionOnlyInput(text)).toBe("command");
    expect(newChatSessionOnlyInput("Ask @crew:reviewers to check it")).toBe("crew");
  });

  it("lets Plan mode and Save as draft travel with the first turn", () => {
    for (const text of ["  /plan add a cache", "/draft later", "/PLAN"])
      expect(newChatSessionOnlyInput(text)).toBeUndefined();
    // A crew delegation stays blocked inside a mode as well.
    expect(newChatSessionOnlyInput("/plan ask @crew:reviewers")).toBe("crew");
  });

  it("passes plain words, provider commands and mid-text slashes through", () => {
    for (const text of ["Fix the build", "/review the diff", "/planning notes", "use a/plan b", "mail me@crew.dev"])
      expect(newChatSessionOnlyInput(text)).toBeUndefined();
  });
});

describe("newChatSuggestions", () => {
  const reasons = { command: "After start", crew: "Crew after start" };
  const row = (id: string, extra: Partial<ComposerSuggestion> = {}): ComposerSuggestion => ({
    id, name: id, label: id, detail: "", kind: "command", group: "commands", ...extra,
  });

  it("keeps what works with only a project and folder", () => {
    const items = [
      row("app:plan"), row("app:draft"), row("skill:review", { kind: "skill" }), row("command:init"),
      row("template:t1", { kind: "template", template: "Body" }), row("src/app.ts", { kind: "file", path: "src/app.ts" }),
      row("note:n1", { kind: "note" }), row("source:files", { kind: "source", action: "scope" }),
    ];
    expect(newChatSuggestions(items, reasons)).toEqual(items);
  });

  it("lists what needs a session as unavailable with its reason, and never as an action", () => {
    const out = newChatSuggestions([
      row("app:compact"), row("app:btw", { action: "side-question" }), row("app:resume", { action: "resume" }),
      row("app:add-to-folder", { action: "move-to-folder" }), row("crew:c1", { kind: "crew" }), row("agent:a1", { kind: "agent" }),
      row("source:crews", { kind: "source", action: "scope" }),
    ], reasons);
    expect(out.map((item) => [item.id, item.unavailable, item.action])).toEqual([
      ["app:compact", "After start", undefined], ["app:btw", "After start", undefined], ["app:resume", "After start", undefined],
      ["app:add-to-folder", "After start", undefined], ["crew:c1", "Crew after start", undefined],
      ["agent:a1", "Crew after start", undefined], ["source:crews", "Crew after start", undefined],
    ]);
  });

  it("drops New session (this screen) and keeps an existing reason", () => {
    const desktop = row("app:clear", { unavailable: "Available on desktop" });
    expect(newChatSuggestions([row("app:new", { action: "new-session" }), desktop], reasons)).toEqual([desktop]);
  });
});

describe("saved new-session draft", () => {
  it("uses one phone-wide key outside the per-session presence keys", () => {
    expect(NEW_CHAT_DRAFT_KEY.startsWith("bycoda.mobile.draft.v1:")).toBe(true);
    expect(NEW_CHAT_DRAFT_KEY).not.toMatch(/^bycoda\.mobile\.draft\.v1:[^[]/);
  });

  it("seeds a prompt link only into an empty draft", () => {
    expect(seededNewChatText("", "Review the PR")).toBe("Review the PR");
    expect(seededNewChatText("  ", "Review the PR")).toBe("Review the PR");
    expect(seededNewChatText("My own words", "Review the PR")).toBeUndefined();
    expect(seededNewChatText("", "   ")).toBeUndefined();
    expect(seededNewChatText("", undefined)).toBeUndefined();
  });

  it("clears after a create only while the draft still holds the sent words", () => {
    expect(newChatDraftWasSent("Fix the build  ", "Fix the build")).toBe(true);
    expect(newChatDraftWasSent("Fix the build and tests", "Fix the build")).toBe(false);
    expect(newChatDraftWasSent("", "")).toBe(false);
  });
});

describe("new chat route key", () => {
  it("names only routes that choose a project, by computer, project, folder and link name", () => {
    expect(newChatRouteKey({})).toBeUndefined();
    expect(newChatRouteKey({ machineId: "m1" })).toBeUndefined();
    expect(newChatRouteKey({ projectId: "alpha", machineId: "m1" })).not.toBe(newChatRouteKey({ projectId: "alpha", machineId: "m2" }));
    expect(newChatRouteKey({ projectId: "alpha", cwd: "/w/a" })).not.toBe(newChatRouteKey({ projectId: "alpha" }));
    expect(newChatRouteKey({ project: "alpha" })).toBeDefined();
    expect(newChatRouteKey({ projectId: "alpha", machineId: "m1" })).toBe(newChatRouteKey({ machineId: "m1", projectId: "alpha" }));
  });
});

describe("new chat send gate", () => {
  it("lets one send through until the create settles", () => {
    const gate = createNewChatSendGate();
    expect(gate.claim()).toBe(true);
    expect(gate.claim()).toBe(false);
    gate.release();
    expect(gate.claim()).toBe(true);
  });
});

describe("new chat working folder choice", () => {
  const main = { isMain: true, missing: false };
  const tree = { isMain: false, missing: false };
  it("is hidden for a folder that is not a Git repository and while the listing is unknown", () => {
    expect(newChatCheckoutAvailable({ canCreate: true, trees: undefined })).toBe(false);
    expect(newChatCheckoutAvailable({ canCreate: true, trees: { worktrees: [] } })).toBe(false);
  });
  it("is offered for a Git project that can create or already has a worktree", () => {
    expect(newChatCheckoutAvailable({ canCreate: true, trees: { worktrees: [main] } })).toBe(true);
    expect(newChatCheckoutAvailable({ canCreate: false, trees: { worktrees: [main] } })).toBe(false);
    expect(newChatCheckoutAvailable({ canCreate: false, trees: { worktrees: [main, tree] } })).toBe(true);
    expect(newChatCheckoutAvailable({ canCreate: false, trees: { worktrees: [main, { ...tree, missing: true }] } })).toBe(false);
  });
  it("keeps a folder chosen by the route so it can be changed back", () => {
    expect(newChatCheckoutAvailable({ cwd: "/w/a-feature", canCreate: false, trees: undefined })).toBe(true);
  });
});

describe("new chat access mode", () => {
  it("keeps the owner's choice while the agent can run it", () => {
    expect(newChatRuntimeMode("supervised", {})).toBe("supervised");
    expect(newChatRuntimeMode("full-access", { supervised: "No" })).toBe("full-access");
  });
  it("never sends or shows a mode the agent refuses; it takes the least permissive one left", () => {
    expect(newChatRuntimeMode("supervised", { supervised: "Headless agy cannot ask before editing files." })).toBe("auto-accept-edits");
    expect(newChatRuntimeMode("supervised", { supervised: "No", "auto-accept-edits": "No" })).toBe("auto");
  });
});
