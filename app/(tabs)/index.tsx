import { ProjectsScreen } from "../../src/features/workspace/projects-screen";
import { MachinesScreen } from "../../src/features/connections/machines-screen";
import { WelcomeScreen } from "../../src/features/connections/welcome-screen";
import { useActiveMachine, useMachines } from "../../src/state/machines";
export default function ProjectsRoute() {
  const machine = useActiveMachine();
  const firstConnection = useMachines(
    (state) => state.hydrated && !state.storageError && state.machines.length === 0,
  );
  return machine ? <ProjectsScreen /> : firstConnection ? <WelcomeScreen /> : <MachinesScreen />;
}
