import type { FileEntry } from "./wire";

export type WorkspaceSegment = "sessions" | "files" | "git";
export type ProjectView = {
  segment: WorkspaceSegment;
  cwd?: string;
  pickingWorktree: boolean;
  file?: string;
};
export type ProjectViewAction =
  | { type: "segment"; segment: WorkspaceSegment }
  | { type: "toggle-worktrees" }
  | { type: "worktree"; cwd?: string }
  | { type: "open-file"; path: string }
  | { type: "close-file" };
export function projectViewReducer(state: ProjectView, action: ProjectViewAction): ProjectView {
  switch (action.type) {
    case "segment":
      return { ...state, segment: action.segment, pickingWorktree: false };
    case "toggle-worktrees":
      return { ...state, pickingWorktree: !state.pickingWorktree };
    case "worktree":
      return { segment: state.segment, cwd: action.cwd, pickingWorktree: false };
    case "open-file":
      return { ...state, segment: "files", file: action.path, pickingWorktree: false };
    case "close-file":
      return { ...state, file: undefined };
  }
}

export type FilesView =
  | { kind: "browse" }
  | { kind: "create" }
  | { kind: "actions"; entry: FileEntry }
  | { kind: "edit"; path: string };
export type FilesState = {
  path: string;
  search: string;
  searchMode: "names" | "content";
  view: FilesView;
};
export type FilesAction =
  | { type: "navigate"; path: string }
  | { type: "search"; value: string }
  | { type: "search-mode"; mode: FilesState["searchMode"] }
  | { type: "view"; view: FilesView }
  | { type: "completed"; view: FilesView };
export function filesReducer(state: FilesState, action: FilesAction): FilesState {
  switch (action.type) {
    case "navigate":
      return { ...state, path: action.path, search: "", view: { kind: "browse" } };
    case "search":
      return { ...state, search: action.value.slice(0, 200) };
    case "search-mode":
      return { ...state, searchMode: action.mode, view: { kind: "browse" } };
    case "view":
      return { ...state, view: action.view };
    case "completed":
      return state.view === action.view ? { ...state, view: { kind: "browse" } } : state;
  }
}

export type GitSelection = { path: string; staged: boolean };
export type GitView =
  | { kind: "files" }
  | { kind: "branches" }
  | { kind: "diff"; selection: GitSelection };
export type GitConfirmation = (
  | { kind: "commit" | "push" | "pull" }
  | { kind: "switch"; branch: string; remote?: string }
  | { kind: "discard"; path: string }
  | { kind: "resolve"; path: string; side: "ours" | "theirs" }
  | { kind: "operation"; choice: "continue" | "abort" }
) & {
  context?: {
    machine: string;
    root: string;
    branch: string | null;
    message: string;
    files: string[];
  };
};
export type GitState = { view: GitView; confirmation: GitConfirmation | null };
export type GitStateAction =
  | { type: "view"; view: GitView }
  | { type: "confirm"; confirmation: GitConfirmation | null }
  | { type: "completed"; confirmation: GitConfirmation }
  | { type: "staged"; path: string };
export const initialGitState: GitState = { view: { kind: "files" }, confirmation: null };
export function gitReducer(state: GitState, action: GitStateAction): GitState {
  switch (action.type) {
    case "view":
      return { view: action.view, confirmation: null };
    case "confirm":
      return { ...state, confirmation: action.confirmation };
    case "completed":
      return state.confirmation !== action.confirmation
        ? state
        : {
            view:
              action.confirmation.kind === "switch" || action.confirmation.kind === "discard"
                ? { kind: "files" }
                : state.view,
            confirmation: null,
          };
    case "staged":
      return state.view.kind === "diff" && state.view.selection.path === action.path
        ? initialGitState
        : state;
  }
}
