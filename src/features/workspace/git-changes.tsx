import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import CheckCircle from "lucide-react-native/icons/circle-check";
import Download from "lucide-react-native/icons/download";
import ArrowDownToLine from "lucide-react-native/icons/arrow-down-to-line";
import ArrowUpFromLine from "lucide-react-native/icons/arrow-up-from-line";
import WandSparkles from "lucide-react-native/icons/wand-sparkles";
import Square from "lucide-react-native/icons/square";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import GitCommitHorizontal from "lucide-react-native/icons/git-commit-horizontal";
import { ActionMenu, Body, Button, Disclosure, ErrorNotice, IconButton, Input, Notice, PressableCard, Row } from "@/ui/primitives";
import { HintLabel } from "@/ui/info-hint";
import { decorativeSvgProps } from "@/ui/accessibility";
import { metrics, space, fontSize, lineHeight } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { GitFileRow } from "./git-file-row";
import { gitCommitBlock, gitPrimaryAction, type GitCommitBlock } from "./git-commit-model";
import type { GitChangesPanelProps, GitCommitPanelProps } from "./git-types";
import type { GitChangeGroup } from "./git-list-model";

function commitBlockText(block: GitCommitBlock, copy: (tr: string, en: string) => string) {
  if (block === "operation") return copy("Çakışmaları veya devam eden işlemi önce bitir.", "Finish conflicts or the running operation first.");
  if (block === "staged") return copy("Önce kaydedilecek dosyaları stage’e al.", "Stage the files you want to record first.");
  return copy("Önce commit mesajı yaz.", "Write a commit message first.");
}

export function GitChangeGroupHeader({ group, count, expanded, onToggle, onBulkAction, busy }: {
  group: GitChangeGroup;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onBulkAction?: () => void;
  busy: boolean;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const countText = new Intl.NumberFormat(useLocale()).format(count);
  const staged = group === "staged";
  const title = staged ? copy("Stage’deki değişiklikler", "Staged changes") : copy("Değişiklikler", "Changes");
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <Row style={{ alignItems: "center", gap: space.xs, marginTop: space.sm }}>
      <PressableCard
        label={`${title} (${countText})`}
        expanded={expanded}
        onPress={onToggle}
        style={{
          flex: 1, minWidth: 0, minHeight: metrics.touchTarget, marginHorizontal: 0,
          flexDirection: "row", alignItems: "center", gap: space.sm,
        }}
      >
        <Chevron color={colors.muted} size={16} />
        <Body selectable={false} style={[uiStyles.grow, { fontWeight: "600" }]}>{title}</Body>
        <Body muted selectable={false}>{countText}</Body>
      </PressableCard>
      {onBulkAction ? (
        <ActionMenu
          label={`${title}. ${copy("Diğer işlemler", "More actions")}`}
          reserveTouchTarget
          actions={[{
            key: "bulk",
            label: staged ? copy("Tümünü çıkar", "Unstage all") : copy("Tümünü stage’e al", "Stage all"),
            disabled: busy,
            onPress: onBulkAction,
          }]}
        />
      ) : null}
    </Row>
  );
}

function CommitMessageField({ message, generation, busy, onChange, placeholder }: {
  message: string;
  generation?: GitCommitPanelProps["generation"];
  busy?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const label = copy("Commit mesajı", "Commit message");
  const cancelLabel = copy("İptal", "Cancel");
  const active = generation?.available ? generation : undefined;
  const pending = !!active?.pending;
  const showAction = !!active && !active.suggestion;
  return (
    <View style={{ gap: space.xs }}>
      {!placeholder ? <HintLabel label={label} /> : null}
      <View>
        <Input
          label={label}
          placeholder={placeholder}
          value={message}
          editable={!busy}
          onChangeText={onChange}
          multiline
          style={{
            minHeight: 66,
            maxHeight: 120,
            fontSize: fontSize.control,
            ...(showAction ? { paddingEnd: metrics.touchTarget + space.sm } : undefined),
          }}
        />
        {showAction ? (
          <View pointerEvents="box-none" style={{ position: "absolute", top: space.xxs, end: space.xxs }}>
            <IconButton
              label={pending
                ? `${copy("Commit mesajı üretiliyor…", "Generating commit message…")} ${cancelLabel}`
                : copy("Commit mesajı üret", "Generate commit message")}
              disabled={!pending && busy}
              reserveTouchTarget
              onPress={pending ? active.cancel : active.start}
            >
              {pending
                ? <Square size={16} color={colors.accent} {...decorativeSvgProps} />
                : <WandSparkles size={18} color={colors.accent} {...decorativeSvgProps} />}
            </IconButton>
          </View>
        ) : null}
      </View>
      {active?.error ? <ErrorNotice error={active.error} /> : null}
      {active?.suggestion ? (
        <Notice
          message={copy("Önerilen commit mesajı", "Suggested commit message")}
          action={{ label: cancelLabel, onPress: active.cancel }}
        >
          <Body selectable>{active.suggestion}</Body>
          <Button
            tone="secondary"
            label={copy("Öneriyi kullan", "Use suggestion")}
            disabled={busy}
            onPress={() => active.useSuggestion(onChange)}
          />
        </Notice>
      ) : null}
    </View>
  );
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
  generation,
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
  const draftOnly = index.files.length === 0 && commitBlock === "staged";
  const messageField = (
    <CommitMessageField message={message} onChange={onMessageChange} busy={busy} generation={generation} />
  );
  return (
    <View style={{ gap: space.sm }}>
      {draftOnly ? messageField : <Disclosure
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
        {messageField}
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
      </Disclosure>}
      {index.remote ? (
        <>
          <Row style={{ gap: space.sm, flexWrap: "wrap" }}>
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
          </Row>
          {index.ahead || index.behind ? (
            <Body muted selectable={false} style={uiStyles.caption}>
              {[
                index.ahead ? copy("{p0} commit gönderilecek", "{p0} commits to push", { p0: numbers.format(index.ahead) }) : null,
                index.behind ? copy("{p0} yeni commit al", "Get {p0} new commits", { p0: numbers.format(index.behind) }) : null,
              ].filter(Boolean).join(" · ")}
            </Body>
          ) : null}
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
  generation,
  busy,
  onCommit,
  onPush,
}: {
  index: GitCommitBarIndex;
  message: string;
  onMessageChange: (value: string) => void;
  generation?: GitCommitPanelProps["generation"];
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
      ? `${copy("Push", "Push")} (${numbers.format(primary.ahead)})`
      : primary.stageAll
        ? copy("Tümünü stage’e al ve commit et", "Stage all & commit")
        : copy("Commit", "Commit");
  const clean = primary.kind === "commit" && primary.block === "clean";
  if (clean && !message) return null;
  const reason = primary.kind === "commit" && primary.block && primary.block !== "clean"
    ? commitBlockText(primary.block, copy)
    : undefined;
  return (
    <View style={{ gap: space.sm }}>
      {primary.kind === "commit" || message ? (
        <CommitMessageField
          placeholder={copy("Mesaj ({p0} dalına commit)", "Message (commit on {p0})", {
            p0: index.branch || "HEAD",
          })}
          message={message}
          busy={busy}
          onChange={onMessageChange}
          generation={generation}
        />
      ) : null}
      {!clean ? <Button
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
      </Button> : null}
    </View>
  );
}
