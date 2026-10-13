import type {
  HostRequest,
  HostAutomation,
  HostAutomationInput,
  HostAutomationRun,
  HostGoal,
  HostGoalInput,
  HostSettings,
  HostSettingsState,
  HostSteward,
  HostStewardInput,
  HostTask,
  HostTaskInput,
  RemoteRequestOptions,
  TaskStatus,
} from "../types";

export function createWorkApi(request: HostRequest) {
  return {
    automations: {
      list: (options?: RemoteRequestOptions) =>
        request<HostAutomation[]>("automations.list", {}, options),
      save: (automation: HostAutomationInput, options?: RemoteRequestOptions) =>
        request<HostAutomation>("automations.save", { automation }, options),
      delete: (automationId: string, options?: RemoteRequestOptions) =>
        request<{ deleted: true }>("automations.delete", { automationId }, options),
      runs: (automationId: string, options?: RemoteRequestOptions) =>
        request<HostAutomationRun[]>("automations.runs", { automationId }, options),
      runNow: (automationId: string, options?: RemoteRequestOptions) =>
        request<HostAutomationRun>("automations.runNow", { automationId }, options),
    },
    tasks: {
      list: (projectId?: string, options?: RemoteRequestOptions) =>
        request<HostTask[]>("tasks.list", { projectId }, options),
      save: (task: HostTaskInput, options?: RemoteRequestOptions) =>
        request<HostTask>("tasks.save", { task }, options),
      move: (taskId: string, to: TaskStatus, options?: RemoteRequestOptions) =>
        request<HostTask>("tasks.move", { taskId, to }, options),
      recheckReview: (taskId: string, options?: RemoteRequestOptions) =>
        request<HostTask>("tasks.review.recheck", { taskId }, options),
      readNotes: (taskId: string, noteIds: string[], options?: RemoteRequestOptions) =>
        request<HostTask>("tasks.notes.read", { taskId, noteIds }, options),
      resolveNote: (
        taskId: string,
        noteId: string,
        resolved: boolean,
        options?: RemoteRequestOptions,
      ) => request<HostTask>("tasks.notes.resolve", { taskId, noteId, resolved }, options),
      delete: (taskId: string, discard = false, options?: RemoteRequestOptions) =>
        request<{ deleted: true }>("tasks.delete", { taskId, discard }, options),
    },
    goals: {
      list: (options?: RemoteRequestOptions) => request<HostGoal[]>("goals.list", {}, options),
      create: (goal: HostGoalInput, options?: RemoteRequestOptions) =>
        request<HostGoal>("goals.create", { goal }, options),
      approve: (goalId: string, options?: RemoteRequestOptions) =>
        request<HostGoal>("goals.approve", { goalId }, options),
      replan: (goalId: string, feedback: string, options?: RemoteRequestOptions) =>
        request<HostGoal>("goals.replan", { goalId, feedback }, options),
      cancel: (goalId: string, options?: RemoteRequestOptions) =>
        request<HostGoal>("goals.cancel", { goalId }, options),
    },
    stewards: {
      list: (options?: RemoteRequestOptions) =>
        request<HostSteward[]>("stewards.list", {}, options),
      save: (steward: HostStewardInput, options?: RemoteRequestOptions) =>
        request<HostSteward>("stewards.save", { steward }, options),
      runNow: (stewardId: string, options?: RemoteRequestOptions) =>
        request<HostSteward>("stewards.runNow", { stewardId }, options),
    },
    settings: {
      get: (options?: RemoteRequestOptions) =>
        request<HostSettingsState>("host.settings.get", {}, options),
      save: (settings: Partial<HostSettings>, options?: RemoteRequestOptions) =>
        request<HostSettingsState>("host.settings.save", { settings }, options),
      revokeDevice: (options?: RemoteRequestOptions) =>
        request<{ revoked: boolean }>("devices.revokeSelf", {}, options),
    },
  };
}
