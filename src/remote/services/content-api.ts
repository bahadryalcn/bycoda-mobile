import type {
  HostRequest,
  MobileInbox,
  MobileNote,
  MobileNoteInput,
  MobileNoteList,
  PrWatch,
  PrWatchInput,
  RemoteRequestOptions,
} from "../types";

export function createContentApi(request: HostRequest) {
  return {
    inbox: {
      attention: (projectId?: string, options?: RemoteRequestOptions) =>
        request<MobileInbox>("inbox.list", { projectId }, options),
      watches: (projectId: string, options?: RemoteRequestOptions) =>
        request<PrWatch[]>("delivery.pr.list", { projectId }, options),
      linkWatch: (input: PrWatchInput, options?: RemoteRequestOptions) =>
        request<PrWatch>("delivery.pr.link", { input }, options),
      pauseWatch: (projectId: string, id: string, options?: RemoteRequestOptions) =>
        request<PrWatch>("delivery.pr.pause", { projectId, id }, options),
      resumeWatch: (projectId: string, id: string, options?: RemoteRequestOptions) =>
        request<PrWatch>("delivery.pr.resume", { projectId, id }, options),
    },
    notes: {
      list: (projectId?: string, options?: RemoteRequestOptions) =>
        request<MobileNoteList>("notes.list", { projectId }, options),
      get: (id: string, options?: RemoteRequestOptions) =>
        request<MobileNote | null>("notes.get", { id }, options),
      save: (note: MobileNoteInput, expectedUpdatedAt: number, options?: RemoteRequestOptions) =>
        request<MobileNote>("notes.upsert", { note, expectedUpdatedAt }, options),
      delete: (id: string, expectedUpdatedAt: number, options?: RemoteRequestOptions) =>
        request<{ deleted: true }>("notes.delete", { id, expectedUpdatedAt }, options),
    },
  };
}
