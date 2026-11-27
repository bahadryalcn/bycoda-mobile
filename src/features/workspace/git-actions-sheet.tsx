import type { ComponentType } from "react";
import ArrowDownToLine from "lucide-react-native/icons/arrow-down-to-line";
import ArrowUpFromLine from "lucide-react-native/icons/arrow-up-from-line";
import Archive from "lucide-react-native/icons/archive";
import Download from "lucide-react-native/icons/download";
import GitBranch from "lucide-react-native/icons/git-branch";
import Link2 from "lucide-react-native/icons/link-2";
import GitPullRequest from "lucide-react-native/icons/git-pull-request";
import History from "lucide-react-native/icons/history";
import Settings2 from "lucide-react-native/icons/settings-2";
import { NavigationGroup, NavigationRow, RowIcon, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { GitDiffIndex } from "./wire";
import { gitSheetActions, type GitSheetKey } from "./git-actions-model";

export type { GitSheetKey } from "./git-actions-model";

const glyphs: Record<GitSheetKey, ComponentType<{ size?: number; strokeWidth?: number; color?: string }>> = {
  push: ArrowUpFromLine,
  pull: ArrowDownToLine,
  fetch: Download,
  branches: GitBranch,
  history: History,
  stashes: Archive,
  management: Settings2,
  createPr: GitPullRequest,
  linkPr: Link2,
};

/**
 * The branch row opens this one sheet of Git commands and destinations. The branch and change
 * count are already on the card that opened it, commit is the page's commit box and refresh is
 * pull-to-refresh, so none of them repeat here.
 */
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
  const actions = gitSheetActions(index, { busy, canRunWorkspace, linkPr }, copy);
  const groups: readonly (readonly GitSheetKey[])[] = [
    ["push", "pull", "fetch"],
    ["branches", "history", "stashes", "management"],
    ["createPr", "linkPr"],
  ];
  const destinations: readonly GitSheetKey[] = ["branches", "history", "stashes", "management", "createPr", "linkPr"];
  return (
    <Sheet
      visible={visible}
      size="compact"
      onClose={onClose}
      title={copy("Git işlemleri", "Git actions")}
    >
      {groups.map((group) => (
        <NavigationGroup key={group[0]}>
          {actions.filter((action) => group.includes(action.key)).map((action) => (
          <NavigationRow
            key={action.key}
            label={action.label}
            detail={action.detail}
            detailLines={2}
            icon={<RowIcon glyph={glyphs[action.key]} />}
            intent={destinations.includes(action.key) ? "navigate" : "command"}
            disabled={action.disabled}
            onPress={() => {
              onClose();
              handlers[action.key]();
            }}
          />
          ))}
        </NavigationGroup>
      ))}
    </Sheet>
  );
}
