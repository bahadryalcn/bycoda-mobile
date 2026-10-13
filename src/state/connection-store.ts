import { create } from "zustand";
import { useMachines } from "./machines";
import { validateMachine } from "./machine-model";
import type { Language, SavedMachine } from "./connection-model";
export type { SavedMachine } from "./connection-model";

interface ConnectionState {
  machines: SavedMachine[];
  activeMachineId: string | null;
  projects: Record<string, string>;
  language: Language;
  hydrated: boolean;
  storageError: string | null;
  tokens: Record<string, string>;
  hydrate: () => Promise<void>;
  saveMachine: (machine: SavedMachine, token: string) => Promise<void>;
  removeMachine: (id: string) => Promise<void>;
  selectMachine: (id: string) => void;
  selectProject: (machineId: string, projectId: string) => void;
  setLanguage: (language: Language) => void;
}
function metadata() {
  const state = useMachines.getState();
  return {
    machines: state.machines.map((machine) => ({
      id: machine.id,
      name: machine.name,
      endpoint: machine.endpoint,
      lanKey: machine.lanKey,
      environmentId: machine.environmentId,
      providers: [...(machine.providers ?? [])],
      capabilities: [...(machine.capabilities ?? [])],
    })),
    activeMachineId: state.activeId,
    projects: state.projects,
    language: state.language,
    hydrated: state.hydrated,
    storageError: state.storageError,
    tokens: {},
  };
}
/** Legacy consumers share canonical metadata. Credentials never enter Zustand. */
export const useConnectionStore = create<ConnectionState>(() => ({
  ...metadata(),
  hydrate: () => useMachines.getState().hydrate(),
  saveMachine: (machine, token) =>
    useMachines.getState().saveMachine(validateMachine(machine), token),
  removeMachine: (id) => useMachines.getState().removeMachine(id),
  selectMachine: (id) => useMachines.getState().selectMachine(id),
  selectProject: (machineId, projectId) => {
    const state = useMachines.getState();
    state.selectMachine(machineId);
    if (useMachines.getState().activeId === machineId)
      useMachines.getState().selectProject(projectId);
  },
  setLanguage: (language) => useMachines.getState().setLanguage(language),
}));
useMachines.subscribe(() => useConnectionStore.setState(metadata()));
