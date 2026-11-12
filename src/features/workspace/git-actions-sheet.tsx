import type { ReactNode } from "react";
import ArrowDownToLine from "lucide-react-native/icons/arrow-down-to-line";
import ArrowUpFromLine from "lucide-react-native/icons/arrow-up-from-line";
import Archive from "lucide-react-native/icons/archive";
import CircleCheck from "lucide-react-native/icons/circle-check";
import Download from "lucide-react-native/icons/download";
import GitBranch from "lucide-react-native/icons/git-branch";
import Link2 from "lucide-react-native/icons/link-2";
import GitPullRequest from "lucide-react-native/icons/git-pull-request";
import History from "lucide-react-native/icons/history";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Settings2 from "lucide-react-native/icons/settings-2";
import { NavigationGroup, NavigationRow, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import type { GitDiffIndex } from "./wire";
import { gitSheetActions, type GitSheetKey } from "./git-actions-model";

export type { GitSheetKey } from "./git-actions-model";

const icons = (color: string): Record<GitSheetKey, ReactNode> => ({
  commit: <CircleCheck size={20} color={color} />,
  push: <ArrowUpFromLine size={20} color={color} />,
  pull: <ArrowDownToLine size={20} color={color} />,
  fetch: <Download size={20} color={color} />,
  branches: <GitBranch size={20} color={color} />,
  history: <History size={20} color={color} />,
  stashes: <Archive size={20} color={color} />,
  management: <Settings2 size={20} color={color} />,
  createPr: <GitPullRequest size={20} color={color} />,
  linkPr: <Link2 size={20} color={color} />,
  refresh: <RefreshCw size={20} color={color} />,
});

/** The branch row opens this one sheet instead of a loose Commit button, spinner and overflow menu. */
export function GitActionsSheet({
  visible,
  index,
  busy,
  canRunWorkspace,
  linkPr,
  handlers,
  onClose,
}: {
  visible: boolean;
  index: GitDiffIndex;
  busy: boolean;
  canRunWorkspace: boolean;
  linkPr?: { hasSession: boolean; linked?: { number: number } };
  handlers: Record<GitSheetKey, () => void>;
  onClose: () => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const glyphs = icons(colors.text);
  const additions = index.additions ? ` · +${index.additions}` : "";
  const deletions = index.deletions ? ` · −${index.deletions}` : "";
  return (
    <Sheet
      visible={visible}
      size="compact"
      onClose={onClose}
      title={`${index.branch || "Git"} · ${copy("{p0} dosya", "{p0} files", { p0: index.files.length })}${additions}${deletions}`}
    >
      <NavigationGroup>
        {gitSheetActions(index, { busy, canRunWorkspace, linkPr }, copy).map((action) => (
          <NavigationRow
            key={action.key}
            label={action.label}
            detail={action.detail}
            detailLines={2}
            icon={glyphs[action.key]}
            disabled={action.disabled}
            onPress={() => {
              onClose();
              handlers[action.key]();
            }}
          />
        ))}
      </NavigationGroup>
    </Sheet>
  );
}
