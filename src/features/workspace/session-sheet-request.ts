import { create } from "zustand";
import { modelSheetTarget } from "./composer-model-sheet";

/**
 * The session toolbar owns history import and the project organization editor; the composer's
 * /resume and /add-to-folder ask it to open them instead of mounting a second editor. Like the model
 * sheet request, the request is explicit state consumed once by the matching session's toolbar.
 */
export type SessionSheetKind = "importHistory" | "moveToFolder";
type SessionSheetRequest = {
  request: { target: string; kind: SessionSheetKind } | null;
  open: (machineId: string, sessionId: string, kind: SessionSheetKind) => void;
  consume: (machineId: string, sessionId: string) => SessionSheetKind | undefined;
};

export const useSessionSheetRequest = create<SessionSheetRequest>((set, get) => ({
  request: null,
  open: (machineId, sessionId, kind) => set({ request: { target: modelSheetTarget(machineId, sessionId), kind } }),
  consume: (machineId, sessionId) => {
    const request = get().request;
    if (request?.target !== modelSheetTarget(machineId, sessionId)) return undefined;
    set({ request: null });
    return request.kind;
  },
}));

export function openSessionSheet(machineId: string, sessionId: string, kind: SessionSheetKind) {
  useSessionSheetRequest.getState().open(machineId, sessionId, kind);
}
