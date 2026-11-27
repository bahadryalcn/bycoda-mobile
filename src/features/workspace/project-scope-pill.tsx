import { useState } from "react";
import Folder from "lucide-react-native/icons/folder";
import Layers from "lucide-react-native/icons/layers";
import { useActiveHostLinkDown } from "@/state/host-runtime-state";
import { useActiveMachine } from "@/state/machines";
import { useCopy } from "@/ui/copy";
import { ScopePill } from "@/ui/scope-pill";
import { useMobileTheme } from "@/ui/theme";
import { ProjectPicker } from "./project-picker";
import { useProjectList } from "./use-project-directory";

/**
 * The one shared "current project" control. Pages pass it as `scopeControl`, so it sits in the page
 * identity row beside the computer selector instead of a full-width field in every toolbar. The
 * page's scope hook (`useLocalProjectScope`, `useInboxLocalScope`) supplies value and change.
 * Directory loading, privacy and failures are explained inside the picker, never as a page row.
 */
export function ProjectScopePill({ projectId, onChange, allowAll = true }: {
  projectId: string | null;
  onChange: (projectId: string | null) => void;
  /**
   * Only Tasks, Notes, Automations (and the session overview) offer All projects. Every other
   * page needs one project: it passes false with `useRequiredProjectScope`, so the picker lists
   * only real projects.
   */
  allowAll?: boolean;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const projects = useProjectList();
  const linkDown = useActiveHostLinkDown();
  const [open, setOpen] = useState(false);
  if (!machine) return null;
  const project = projectId && projects.directoryReady ? projects.data?.find((entry) => entry.id === projectId) : undefined;
  // A saved project that is no longer listed reads as All projects, matching the pages it scopes.
  const all = allowAll && (!projectId || (projects.directoryReady && !project));
  const label = project ? project.name
    : all ? copy("Tüm projeler", "All projects")
    : projects.directoryReady ? copy("Proje seç", "Choose a project")
    : linkDown ? copy("Bağlantı bekleniyor", "Waiting for a connection")
    : projects.error ? copy("Kullanılamıyor", "Unavailable")
    : copy("Projeler yükleniyor…", "Loading projects…");
  const Icon = all ? Layers : Folder;
  return (
    <>
      <ScopePill
        icon={<Icon size={14} strokeWidth={2} color={colors.muted} style={{ flexShrink: 0 }} />}
        label={label}
        accessibilityLabel={`${copy("Proje", "Project")}: ${label}. ${copy("Proje seç", "Choose a project")}`}
        expanded={open}
        onPress={() => setOpen(true)}
      />
      {open ? (
        <ProjectPicker
          key={machine.id}
          visible
          selectedId={projectId}
          onClose={() => setOpen(false)}
          onSelectAll={allowAll ? () => { setOpen(false); onChange(null); } : undefined}
          onSelect={(selected) => {
            setOpen(false);
            if (projects.isProjectVisible(selected.id, selected.cwd)) onChange(selected.id);
          }}
        />
      ) : null}
    </>
  );
}
