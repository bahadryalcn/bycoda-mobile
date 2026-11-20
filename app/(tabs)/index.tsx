import { ProjectsScreen } from "../../src/features/workspace/projects-screen";
import { MachinesScreen } from "../../src/features/connections/machines-screen";
import { WelcomeScreen } from "../../src/features/connections/welcome-screen";
import { useActiveMachine, useMachines } from "../../src/state/machines";
import { TabRootColumn } from "../../src/ui/tab-root-column";
export default function ProjectsRoute() {
  const machine = useActiveMachine();
  const hydrated = useMachines((state) => state.hydrated);
  const firstConnection = useMachines(
    (state) => state.hydrated && !state.storageError && state.machines.length === 0,
  );
  // Saved computers load from device storage in a moment; showing the computer list first would
  // flash its skeleton and then jump to the first-run screen.
  if (!machine && !hydrated) return <TabRootColumn>{null}</TabRootColumn>;
  return <TabRootColumn>{machine ? <ProjectsScreen /> : firstConnection ? <WelcomeScreen /> : <MachinesScreen />}</TabRootColumn>;
}
