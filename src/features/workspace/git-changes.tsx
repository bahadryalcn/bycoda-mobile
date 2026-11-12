import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import CheckCircle from "lucide-react-native/icons/circle-check";
import Download from "lucide-react-native/icons/download";
import ArrowDownToLine from "lucide-react-native/icons/arrow-down-to-line";
import ArrowUpFromLine from "lucide-react-native/icons/arrow-up-from-line";
import GitCommitHorizontal from "lucide-react-native/icons/git-commit-horizontal";
import { Body, Button, Disclosure, Field, Row } from "@/ui/primitives";
import { space, fontSize, lineHeight } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { GitFileRow } from "./git-file-row";
import type { GitChangesPanelProps, GitCommitPanelProps } from "./git-types";

export function GitChangesPanel({ files, busy, onSelect, onAction }: GitChangesPanelProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
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
              >{`${title} · ${groupedFiles.length}`}</Body>
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
  const stagedCount = index.files.filter((file) => file.staged).length;
  const commitDisabled =
    !message.trim() || !stagedCount || !!index.conflicts?.length || !!index.operation;
  return (
    <View style={{ gap: space.sm }}>
      <Disclosure
        label={copy("Commit oluştur", "Create commit")}
        detail={
          stagedCount
            ? copy("{p0} dosya stage’de", "{p0} staged files", { p0: stagedCount })
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
          density="compact"
          tone="primary"
          disabled={busy || commitDisabled}
          onPress={() => onChoose({ kind: "commit" })}
          style={{ alignSelf: "flex-start" }}
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
            >{`${index.ahead} ↑  ${index.behind} ↓`}</Body>
          </Row>
        </>
      ) : null}
      {children}
    </View>
  );
}
