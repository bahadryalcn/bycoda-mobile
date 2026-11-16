import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ScrollView } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import type { HostProject } from "@/domain/types";
import { FormActions, Sheet, StateView } from "@/ui/primitives";
import { ScreenChromeProvider } from "@/ui/layout";
import { PrivateContentBoundary, usePrivateContentAccess } from "@/ui/private-content";
import { useCopy } from "@/ui/copy";
import { metrics, space } from "@/ui/tokens";
import { useProjectList } from "./use-project-directory";
import { ProjectDirectoryFeedback } from "./project-directory-feedback";
import { BrowserScreen } from "../tools/browser-screen";
import type { SessionScope } from "./session-types";

/** The browser keeps drafts during temporary concealment; its opening target never changes. */
export function SessionBrowser({ scope, projectId, onClose }: { scope: SessionScope; projectId: string; onClose: () => void }) {
  const copy = useCopy(), machine = useActiveMachine(), connection = useConnectionScope(), access = usePrivateContentAccess(), projects = useProjectList();
  const [opening] = useState(() => ({ ...scope, projectId, connection }));
  const [retained, setRetained] = useState<HostProject>();
  const mounted = useRef(false), retired = useRef(false), denied = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scopeCurrent = connection === opening.connection && opening.connection.isCurrent() && machine?.id === opening.machineId && useMachines.getState().activeId === opening.machineId && scope.machineId === opening.machineId && scope.sessionId === opening.sessionId && projectId === opening.projectId;
  const supported = scopeCurrent && !!machine?.capabilities?.includes("browser.shared");
  const available = scopeCurrent && access.allowed && access.check();
  const kind = (projects.error as { kind?: string } | null)?.kind;
  if (kind === "auth" || kind === "identity") denied.current = true;
  else if (projects.isSuccess && !projects.error && !projects.isFetching && projects.directoryReady && projects.readable && !projects.privacyPending) denied.current = false;
  const proofReady = available && supported && projects.readable && projects.directoryReady && !projects.privacyPending && !projects.verifying && projects.isEnabled !== false && projects.fetchStatus !== "paused" && !denied.current;
  const candidate = projects.data?.find(row => row.id === opening.projectId);
  const admitted = proofReady && !!candidate && projects.isProjectVisible(opening.projectId, candidate.cwd);
  if (admitted && retained && candidate.cwd !== retained.cwd) retired.current = true;
  const project = retained ?? (admitted ? candidate : undefined);
  useLayoutEffect(() => { if (!retained && admitted && candidate && !retired.current) setRetained({ ...candidate }); }, [retained, admitted, candidate]);
  const usable = !!project && admitted && !retired.current && candidate.cwd === project.cwd;
  const live = useRef({ scopeCurrent, available, supported, access, projects, project, proofReady });
  live.current = { scopeCurrent, available, supported, access, projects, project, proofReady };
  const originalCurrent = () => mounted.current && live.current.scopeCurrent && opening.connection.isCurrent() && useMachines.getState().activeId === opening.machineId && live.current.access.allowed && live.current.access.check();
  const canUse = () => originalCurrent() && live.current.supported && !retired.current && !denied.current && live.current.proofReady && !!live.current.project &&
    !!useMachines.getState().machines.find(row => row.id === opening.machineId)?.capabilities?.includes("browser.shared") && live.current.projects.isProjectVisible(opening.projectId, live.current.project.cwd);
  const lease = useMemo(() => ({ active: false }), [scopeCurrent, available, supported, projects.isEnabled, projects.isFetching]);
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  const retry = async () => { if (lease.active && originalCurrent() && live.current.supported && !retired.current && live.current.projects.isEnabled !== false && !live.current.projects.isFetching) await live.current.projects.refetch(); };
  const close = () => { if (mounted.current) onClose(); };
  const feedbackQuery = { ...projects, data: usable ? projects.data : undefined, refetch: retry };
  const unavailable = <StateView illustration="locked" title={copy("Kayıt erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.", "Record access is unavailable. Check the original computer and project connection.")} />;
  return <Sheet visible title={copy("Tarayıcı", "Browser")} size="full" scroll={false} onClose={close}
    footer={!usable ? <FormActions tone="quiet" submitLabel={copy("Kapat", "Close")} onSubmit={close} /> : undefined}>
    {!usable ? <ScrollView contentContainerStyle={{ flexGrow: 1, gap: space.sm, paddingHorizontal: space.screen, paddingVertical: space.sm, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}>
      {!available ? unavailable : !supported ? <StateView illustration="error" title={copy("Bu bilgisayar ortak tarayıcıyı desteklemiyor.", "This computer does not support the shared browser.")} />
        : retired.current ? <StateView illustration="error" title={copy("Proje klasörü değişti. Tarayıcıyı güncel projeden yeniden aç.", "The project folder changed. Reopen the browser from the current project.")} />
        : denied.current && !projects.error && !projects.isFetching ? unavailable
        : proofReady && candidate && !projects.isProjectVisible(opening.projectId, project?.cwd ?? candidate.cwd) ? unavailable
        : <ProjectDirectoryFeedback query={feedbackQuery} readiness={projects.fetchStatus === "paused" || projects.isEnabled === false || !projects.readable ? "waiting" : projects.readiness} privacyUnavailable={projects.privacyUnavailable}
          empty={projects.directoryReady && projects.isSuccess && !projects.isFetching && !candidate} emptyTitle={copy("Proje bulunamadı.", "Project not found.")} />}
    </ScrollView> : null}
    {scopeCurrent && !retired.current && project ? <PrivateContentBoundary visible={usable} isAllowed={canUse}>
      <ScreenChromeProvider nativeTitle bottomSafeArea={false}><BrowserScreen project={usable ? candidate : project} sessionId={opening.sessionId} embedded /></ScreenChromeProvider>
    </PrivateContentBoundary> : null}
  </Sheet>;
}
