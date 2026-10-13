import type {
  HostRequest,
  GitDiffIndex,
  GitFileDiff,
  HostBranches,
  HostDirectory,
  HostFileEntry,
  HostGitAction,
  HostModelCatalog,
  HostProject,
  HostProjectDirectory,
  HostWorktrees,
  ProjectSearchResult,
  RemoteRequestOptions,
  WorkspaceTarget,
} from "../types";

export function createWorkspaceApi(request: HostRequest) {
  return {
    projects: {
      list: (options?: RemoteRequestOptions) =>
        request<HostProject[]>("projects.list", {}, options),
      directory: (options?: RemoteRequestOptions) =>
        request<HostProjectDirectory>("projects.directory", {}, options),
      browse: (path?: string, options?: RemoteRequestOptions) =>
        request<HostDirectory>("projects.browse", { path }, options),
      open: (cwd: string, options?: RemoteRequestOptions) =>
        request<HostProject>("projects.open", { cwd }, options),
      createDirectory: (path: string, name: string, options?: RemoteRequestOptions) =>
        request<HostDirectory>("projects.createDirectory", { path, name }, options),
      models: (projectId: string, options?: RemoteRequestOptions) =>
        request<HostModelCatalog>("models.list", { projectId }, options),
    },
    files: {
      list: (target: WorkspaceTarget, path = "", options?: RemoteRequestOptions) =>
        request<HostFileEntry[]>("files.list", { ...target, path }, options),
      read: (target: WorkspaceTarget, path: string, options?: RemoteRequestOptions) =>
        request<string>("files.read", { ...target, path }, options),
      write: (
        target: WorkspaceTarget,
        path: string,
        expected: string,
        content: string,
        options?: RemoteRequestOptions,
      ) => request<null>("files.write", { ...target, path, expected, content }, options),
      create: (
        target: WorkspaceTarget,
        parent: string,
        name: string,
        isDir: boolean,
        options?: RemoteRequestOptions,
      ) => request<string>("files.create", { ...target, parent, name, isDir }, options),
      index: (target: WorkspaceTarget, options?: RemoteRequestOptions) =>
        request<string[]>("files.index", { ...target }, options),
      search: (target: WorkspaceTarget, query: string, options?: RemoteRequestOptions) =>
        request<string[]>("files.search", { ...target, query }, options),
      searchContent: (target: WorkspaceTarget, query: string, options?: RemoteRequestOptions) =>
        request<ProjectSearchResult>("files.searchContent", { ...target, query }, options),
    },
    git: {
      index: (target: WorkspaceTarget, options?: RemoteRequestOptions) =>
        request<GitDiffIndex>("git.index", { ...target }, options),
      fileDiff: (
        target: WorkspaceTarget,
        path: string,
        staged = false,
        options?: RemoteRequestOptions,
      ) => request<GitFileDiff>("git.fileDiff", { ...target, path, staged }, options),
      action: (
        target: WorkspaceTarget,
        action: HostGitAction,
        params: { path?: string; message?: string; content?: string } = {},
        options?: RemoteRequestOptions,
      ) => request<null | string>("git.action", { ...target, action, ...params }, options),
      branches: (target: WorkspaceTarget, options?: RemoteRequestOptions) =>
        request<HostBranches>("git.branches", { ...target }, options),
      switchBranch: (
        target: WorkspaceTarget,
        branch: string,
        remote?: string,
        options?: RemoteRequestOptions,
      ) => request<HostBranches>("git.switch", { ...target, branch, remote }, options),
      createBranch: (target: WorkspaceTarget, branch: string, options?: RemoteRequestOptions) =>
        request<HostBranches>("git.createBranch", { ...target, branch }, options),
      worktrees: (projectId: string, options?: RemoteRequestOptions) =>
        request<HostWorktrees>("git.worktrees", { projectId }, options),
    },
  };
}
