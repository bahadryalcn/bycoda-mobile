import { useState } from "react";
import { View } from "react-native";
import Folder from "lucide-react-native/icons/folder";
import Globe from "lucide-react-native/icons/globe";
import { decorativeSvgProps } from "@/ui/accessibility";
import { useCopy } from "@/ui/copy";
import { ScopePill } from "@/ui/scope-pill";
import { useMobileTheme } from "@/ui/theme";
import { ProjectPicker } from "../workspace/project-picker";

/**
 * Which conversation the assistant is in, as on the desktop: General or one project of this computer.
 * It looks like the shared project pill but is the assistant's own choice: it never changes the app-wide
 * project. `projectId` "" is General; `label` is the current scope's name (loading or hidden included).
 * Switching opens that scope's conversation; the owner (assistant screen) guards a live call.
 */
export function AssistantScopePill({ projectId, label, disabled = false, onChange }: {
  projectId: string;
  label: string;
  disabled?: boolean;
  onChange(projectId: string): void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const Icon = projectId ? Folder : Globe;
  return (
    <>
      <ScopePill
        icon={<Icon {...decorativeSvgProps} size={14} strokeWidth={2} color={colors.muted} style={{ flexShrink: 0 }} />}
        label={label}
        accessibilityLabel={`${copy("Konuşma kapsamı", "Conversation scope")}: ${label}. ${copy("Kapsam seç", "Choose a scope")}`}
        expanded={open}
        disabled={disabled}
        onPress={() => { if (!disabled) setOpen(true); }}
      />
      {open ? (
        <ProjectPicker
          visible
          title={copy("Konuşma kapsamı", "Conversation scope")}
          allLabel={copy("Genel", "Global")}
          allIcon={<View style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
            <Globe {...decorativeSvgProps} size={20} strokeWidth={2} color={colors.muted} />
          </View>}
          selectedId={projectId || null}
          onClose={() => setOpen(false)}
          onSelectAll={() => { setOpen(false); onChange(""); }}
          onSelect={(project) => { setOpen(false); onChange(project.id); }}
        />
      ) : null}
    </>
  );
}
