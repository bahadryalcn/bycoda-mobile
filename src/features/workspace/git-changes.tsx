import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import CheckCircle from "lucide-react-native/icons/circle-check";
import Download from "lucide-react-native/icons/download";
import ArrowDownToLine from "lucide-react-native/icons/arrow-down-to-line";
import ArrowUpFromLine from "lucide-react-native/icons/arrow-up-from-line";
import GitCommitHorizontal from "lucide-react-native/icons/git-commit-horizontal";
import { Body, Button, Disclosure, Field, Input, Row } from "@/ui/primitives";
import { space, fontSize, lineHeight } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { GitFileRow } from "./git-file-row";
import { gitCommitBlock, gitPrimaryAction, type GitCommitBlock } from "./git-commit-model";
import type { GitChangesPanelProps, GitCommitPanelProps } from "./git-types";

function commitBlockText(block: GitCommitBlock, copy: (tr: string, en: string) => string) {
  if (block === "operation") return copy("Çakışmaları veya devam eden işlemi önce bitir.", "Finish conflicts or the running operation first.");
  if (block === "staged") return copy("Önce kaydedilecek dosyaları stage’e al.", "Stage the files you want to record first.");
  return copy("Önce commit mesajı yaz.", "Write a commit message first.");
}

export function GitChangesPanel({ files, busy, onSelect, onAction }: GitChangesPanelProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const numbers = new Intl.NumberFormat(useLocale());
  if (!files.some((file) => file.staged || file.unstaged)) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.md }}>
        <CheckCircle size={18} color={colors.success} />
        <View style={uiStyles.grow}>
          <Body style={{ fontSize: fontSize.control, lineHeight: lineHeight.control, fontWeight: "600" }}>
            {copy("Çalışma klasörü temiz", "Working folder is clean")}
          </Body>
          <Body muted style={uiStyles.caption}>
            {copy("Kaydedilecek dosya değişikliği yok.", "No file changes to record.")}
          </Body>
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: space.sm }}>
      {(["unstaged", "staged"] as const).map((group) => {
        const groupedFiles = files.filter((file) => file[group]);
        if (!groupedFiles.length) return null;
        const staged = group === "staged";
        const title = staged
          ? copy("Stage’de", "Staged")
          : copy("Değişen dosyalar", "Changed files");
        return (
          <View key={group} style={{ gap: space.xs }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                paddingVertical: space.xs,
              }}
            >
              <Body
                style={[
                  uiStyles.grow,
                  { fontSize: fontSize.small, lineHeight: lineHeight.small, fontWeight: "600" },
                ]}
              >{`${title} · ${numbers.format(groupedFiles.length)}`}</Body>
              <Button
                density="compact"
                label={
                  staged
                    ? copy("Tümünü çıkar", "Unstage all")
                    : copy("Tümünü stage’e al", "Stage all")
                }
                busy={busy}
                onPress={() => onAction(staged ? "unstageAll" : "stageAll")}
              />
            </View>
            {groupedFiles.map((file) => (
              <View key={`${group}:${file.relative}`}>
                <GitFileRow
                  file={file}
                  staged={staged}
                  busy={busy}
                  onPreview={() => onSelect({ path: file.relative, staged })}
                  onStage={() => onAction(staged ? "unstage" : "stage", file.relative)}
                />
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export function GitCommitPanel({
  index,
  canRunWorkspace,
  message,
  onMessageChange,
  fetching,
  onFetch,
  onChoose,
  children,
  busy,
}: GitCommitPanelProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const numbers = new Intl.NumberFormat(useLocale());
  const stagedCount = index.files.filter((file) => file.staged).length;
  const commitBlock = gitCommitBlock({
    message,
    stagedCount,
    hasConflicts: !!index.conflicts?.length,
    hasOperation: !!index.operation,
  });
  const commitReason = commitBlock ? commitBlockText(commitBlock, copy) : undefined;
  return (
    <View style={{ gap: space.sm }}>
      <Disclosure
        label={copy("Commit oluştur", "Create commit")}
        detail={
          stagedCount
            ? copy("{p0} dosya stage’de", "{p0} staged files", { p0: numbers.format(stagedCount) })
            : copy(
                "Önce kaydedilecek dosyaları stage’e al.",
                "Stage the files you want to record first.",
              )
        }
        defaultExpanded={stagedCount > 0}
      >
        <Field
          label={copy("Commit mesajı", "Commit message")}
          value={message}
          editable={!busy}
          onChangeText={onMessageChange}
          multiline
          style={{ minHeight: 66, maxHeight: 120, fontSize: fontSize.control }}
        />
        <Button
          label={copy("Commit", "Commit")}
          accessibilityLabel={
            commitReason && !busy ? `${copy("Commit", "Commit")}. ${commitReason}` : undefined
          }
          tone="primary"
          fullWidth
          disabled={busy || !!commitBlock}
          onPress={() => onChoose({ kind: "commit" })}
        >
          <GitCommitHorizontal size={18} color={colors.primaryText} />
        </Button>
      </Disclosure>
      {index.remote ? (
        <>
          <Row style={{ gap: space.sm }}>
            {canRunWorkspace ? (
              <Button
                label={copy("Fetch", "Fetch")}
                density="compact"
                busy={fetching}
                disabled={busy}
                onPress={onFetch}
              >
                <Download size={16} color={colors.text} />
              </Button>
            ) : null}
            {canRunWorkspace ? (
              <Button
                label={copy("Pull", "Pull")}
                disabled={busy}
                density="compact"
                onPress={() => onChoose({ kind: "pull" })}
              >
                <ArrowDownToLine size={16} color={colors.text} />
              </Button>
            ) : null}
            <Button
              label={copy("Push", "Push")}
              accessibilityLabel={
                index.ahead === 0 && !busy
                  ? `${copy("Push", "Push")}. ${copy("No local commits to push.", "No local commits to push.")}`
                  : undefined
              }
              density="compact"
              disabled={busy || index.ahead === 0}
              onPress={() => onChoose({ kind: "push" })}
            >
              <ArrowUpFromLine size={16} color={colors.text} />
            </Button>
            <Body
              muted
              numberOfLines={1}
              selectable={false}
              style={[uiStyles.caption, uiStyles.grow]}
            >{`${numbers.format(index.ahead)} ↑  ${numbers.format(index.behind)} ↓`}</Body>
          </Row>
        </>
      ) : null}
      {children}
    </View>
  );
}

type GitCommitBarIndex = Pick<
  GitCommitPanelProps["index"],
  "files" | "ahead" | "remote" | "conflicts" | "operation" | "branch"
>;

/** VS Code style commit box: one message field and one primary button (commit, or push when clean and ahead). */
export function GitCommitBar({
  index,
  message,
  onMessageChange,
  busy,
  onCommit,
  onPush,
}: {
  index: GitCommitBarIndex;
  message: string;
  onMessageChange: (value: string) => void;
  busy: boolean;
  onCommit: (stageAll: boolean) => void;
  onPush: () => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const numbers = new Intl.NumberFormat(useLocale());
  const primary = gitPrimaryAction({
    message,
    files: index.files,
    ahead: index.ahead,
    hasRemote: !!index.remote,
    hasConflicts: !!index.conflicts?.length,
    hasOperation: !!index.operation,
  });
  const label =
    primary.kind === "push"
      ? copy("Push ↑{p0}", "Push ↑{p0}", { p0: numbers.format(primary.ahead) })
      : primary.stageAll
        ? copy("Tümünü stage’e al ve commit et", "Stage all & commit")
        : copy("Commit", "Commit");
  const reason =
    primary.kind === "commit" && primary.block
      ? primary.block === "clean"
        ? copy("Kaydedilecek değişiklik yok.", "Nothing to commit.")
        : commitBlockText(primary.block, copy)
      : undefined;
  return (
    <View style={{ gap: space.sm }}>
      {primary.kind === "commit" ? (
        <Input
          label={copy("Commit mesajı", "Commit message")}
          placeholder={copy("Mesaj ({p0} dalına commit)", "Message (commit on {p0})", {
            p0: index.branch || "HEAD",
          })}
          value={message}
          editable={!busy}
          onChangeText={onMessageChange}
          multiline
          style={{ minHeight: 66, maxHeight: 120, fontSize: fontSize.control }}
        />
      ) : null}
      <Button
        label={label}
        accessibilityLabel={reason && !busy ? `${label}. ${reason}` : undefined}
        tone="primary"
        fullWidth
        disabled={busy || primary.disabled}
        onPress={() => (primary.kind === "push" ? onPush() : onCommit(primary.stageAll))}
      >
        {primary.kind === "push" ? (
          <ArrowUpFromLine size={18} color={colors.primaryText} />
        ) : (
          <GitCommitHorizontal size={18} color={colors.primaryText} />
        )}
      </Button>
    </View>
  );
}
