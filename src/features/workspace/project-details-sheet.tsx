import { View } from "react-native";
import Copy from "lucide-react-native/icons/copy";
import { Body, Button, NavigationGroup, NavigationRow, RowIcon, Sheet, StatusRow } from "@/ui/primitives";
import { ProjectIcon } from "@/ui/project-icon";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import type { HostProject } from "@/domain/types";

/**
 * Where a project lives. The path is shown here only, never in lists or headers; Files, Changes and
 * the other ways in live in the project options sheet, not here.
 */
export function ProjectDetailsSheet({
  visible,
  project,
  machineName,
  groupName,
  registered = true,
  onClose,
  onOpen,
}: {
  visible: boolean;
  project: Pick<HostProject, "name" | "cwd" | "appearance">;
  machineName?: string;
  groupName?: string;
  registered?: boolean;
  onClose: () => void;
  onOpen?: () => void;
}) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const clipboard = useClipboardFeedback(project.cwd, visible);
  return (
    <Sheet
      visible={visible}
      size="compact"
      title={copy("Proje ayrıntıları", "Project details")}
      onClose={onClose}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.row }}>
        <ProjectIcon appearance={project.appearance} size={26} box={36} />
        <Body selectable style={[uiStyles.title, { flex: 1, fontWeight: "700" }]}>
          {project.name}
        </Body>
      </View>
      <View style={{ gap: space.sm }}>
        <StatusRow label={copy("Klasör", "Folder")} />
        <Body mono selectable style={uiStyles.caption}>
          {project.cwd}
        </Body>
        {machineName ? (
          <StatusRow label={copy("Bilgisayar", "Computer")}>
            <Body muted>{machineName}</Body>
          </StatusRow>
        ) : null}
        {groupName ? (
          <StatusRow label={copy("Grup", "Group")}>
            <Body muted>{groupName}</Body>
          </StatusRow>
        ) : null}
      </View>
      {onOpen ? (
        <Button
          label={registered ? copy("Aç", "Open") : copy("Projeyi aç", "Open project")}
          tone="primary"
          fullWidth
          reserveTouchTarget
          onPress={onOpen}
        />
      ) : null}
      <NavigationGroup>
        <NavigationRow
          intent="command"
          label={
            clipboard.copied ? copy("Kopyalandı", "Copied") : copy("Yolu kopyala", "Copy path")
          }
          icon={<RowIcon glyph={Copy} />}
          busy={clipboard.busy}
          onPress={clipboard.copy}
        />
      </NavigationGroup>
    </Sheet>
  );
}
