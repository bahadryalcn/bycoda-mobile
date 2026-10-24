import { useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { Notice, QueryState, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useProjectList } from "./use-project-directory";
import { BrowserScreen } from "../tools/browser-screen";
import type { SessionScope } from "./session-types";

export function SessionBrowser({ scope, projectId, onClose }: { scope: SessionScope; projectId: string; onClose: () => void }) {
  const copy = useCopy(); const machine = useActiveMachine(); const projects = useProjectList();
  const [opening] = useState(() => ({ ...scope, projectId }));
  const current = machine?.id === opening.machineId && useMachines.getState().activeId === opening.machineId && scope.sessionId === opening.sessionId && projectId === opening.projectId;
  const project = current ? projects.data?.find((row) => row.id === opening.projectId) : undefined;
  return <Sheet visible title={copy("Tarayıcı", "Browser")} size="full" scroll={false} onClose={onClose}>
    {!current ? <Notice message={copy("Seçili bilgisayar değişti veya bu özelliği desteklemiyor.", "The selected computer changed or does not support this feature.")} />
      : !machine.capabilities?.includes("browser.shared") ? <Notice message={copy("Bu bilgisayar ortak tarayıcıyı desteklemiyor.", "This computer does not support the shared browser.")} />
      : project ? <BrowserScreen project={project} sessionId={opening.sessionId} /> : <QueryState query={projects} empty={!projects.isPending} emptyTitle={copy("Proje bulunamadı.", "Project not found.")} />}
  </Sheet>;
}
