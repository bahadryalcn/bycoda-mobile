import { useState, type ReactNode } from "react";
import ArrowDownToLine from "lucide-react-native/icons/arrow-down-to-line";
import ArrowUpFromLine from "lucide-react-native/icons/arrow-up-from-line";
import Eye from "lucide-react-native/icons/eye";
import FileText from "lucide-react-native/icons/file-text";
import Trash2 from "lucide-react-native/icons/trash-2";
import { NavigationGroup, NavigationRow, Sheet } from "@/ui/primitives";
import { SwipeActions, type SwipeRowAction } from "@/ui/swipe-actions";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { GitFileRow } from "./git-file-row";
import { gitFileRowActions, gitSwipeActions, type GitFileRowAction } from "./git-file-actions-model";
import type { GitChangedFile } from "./wire";

/** Changed-file row with swipe (stage/discard) and long-press (full action sheet). */
export function GitFileSwipeRow({
  file,
  staged,
  busy,
  onPreview,
  onStage,
  onOpen,
  onDiscard,
}: {
  file: GitChangedFile;
  staged: boolean;
  busy: boolean;
  onPreview: () => void;
  onStage: () => void;
  onOpen: () => void;
  onDiscard: () => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const [sheet, setSheet] = useState(false);
  const all = gitFileRowActions(file, staged);
  const icons: Record<GitFileRowAction, ReactNode> = {
    stage: <ArrowDownToLine size={18} />,
    unstage: <ArrowUpFromLine size={18} />,
    preview: <Eye size={18} color={colors.muted} />,
    open: <FileText size={18} color={colors.muted} />,
    discard: <Trash2 size={18} />,
  };
  const spec: Record<GitFileRowAction, { label: string; run: () => void }> = {
    stage: { label: copy("Stage’e al", "Stage"), run: onStage },
    unstage: { label: copy("Stage’den çıkar", "Unstage"), run: onStage },
    preview: { label: copy("Değişiklikleri göster", "View changes"), run: onPreview },
    open: { label: copy("Dosyayı aç", "Open file"), run: onOpen },
    discard: { label: copy("Değişiklikleri at", "Discard changes"), run: onDiscard },
  };
  const swipe: SwipeRowAction[] = gitSwipeActions(all).map((action) => ({
    key: action,
    label: spec[action].label,
    icon: icons[action],
    destructive: action === "discard",
    disabled: busy,
    onPress: spec[action].run,
  }));
  return (
    <>
      <SwipeActions actions={swipe} disabled={busy}>
        <GitFileRow file={file} staged={staged} busy={busy} onPreview={onPreview} onStage={onStage} onLongPress={() => setSheet(true)} />
      </SwipeActions>
      <Sheet visible={sheet} size="compact" title={file.relative.split("/").pop() ?? file.relative} onClose={() => setSheet(false)}>
        <NavigationGroup>
          {all.map((action) => (
            <NavigationRow
              key={action}
              label={spec[action].label}
              icon={icons[action]}
              tone={action === "discard" ? "danger" : undefined}
              intent="command"
              disabled={busy}
              onPress={() => {
                setSheet(false);
                spec[action].run();
              }}
            />
          ))}
        </NavigationGroup>
      </Sheet>
    </>
  );
}
