import { create } from "zustand";

/**
 * One editor per value: the composer's model chip owns the "Model and access" sheet and its draft.
 * Other entry points (session options, session settings, the context ring) ask it to open instead
 * of mounting a second editor. The request is explicit state, consumed once by the matching chip.
 */
type ModelSheetRequest = {
  /** `machineId:sessionId` of the conversation whose sheet should open. */
  target: string | null;
  open: (machineId: string, sessionId: string) => void;
  consume: (machineId: string, sessionId: string) => boolean;
};

export const modelSheetTarget = (machineId: string, sessionId: string) => `${machineId}:${sessionId}`;

export const useModelSheetRequest = create<ModelSheetRequest>((set, get) => ({
  target: null,
  open: (machineId, sessionId) => set({ target: modelSheetTarget(machineId, sessionId) }),
  consume: (machineId, sessionId) => {
    if (get().target !== modelSheetTarget(machineId, sessionId)) return false;
    set({ target: null });
    return true;
  },
}));

export function openModelSheet(machineId: string, sessionId: string) {
  useModelSheetRequest.getState().open(machineId, sessionId);
}
