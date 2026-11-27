import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import ArrowUpFromLine from "lucide-react-native/icons/arrow-up-from-line";
import WandSparkles from "lucide-react-native/icons/wand-sparkles";
import Square from "lucide-react-native/icons/square";
import GitCommitHorizontal from "lucide-react-native/icons/git-commit-horizontal";
import { Body, Button, ErrorNotice, IconButton, Input, Notice, PressableCard, Row, SectionHeader } from "@/ui/primitives";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { HintLabel } from "@/ui/info-hint";
import { decorativeSvgProps } from "@/ui/accessibility";
import { hitSlopFor, metrics, space, fontSize, lineHeight } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { gitMergeSuggestion, gitPrimaryAction, type GitCommitBlock } from "./git-commit-model";
import type { GitCommitPanelProps } from "./git-types";
import type { GitChangeGroup } from "./git-list-model";

/** One name for a checkout without a branch, shared by the branch card and the commit box. */
export function gitDetachedLabel(copy: (tr: string, en: string) => string) {
  return copy("Dal yok (detached HEAD)", "No branch (detached HEAD)");
}

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
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const staged = group === "staged";
  const title = staged ? copy("Stage’deki değişiklikler", "Staged changes") : copy("Değişiklikler", "Changes");
  // The same collapsible section header as the session shelves: shared label, quiet count, chevron.
  return (
    <Row style={{ alignItems: "center", gap: space.xs, flexWrap: "nowrap" }}>
      <PressableCard
        label={`${title}. ${count}`}
        expanded={expanded}
        onPress={onToggle}
        hitSlop={hitSlopFor(metrics.sectionHeaderHeight)}
        style={{ flex: 1, minWidth: 0, minHeight: 0, paddingVertical: 0, marginHorizontal: 0 }}
      >
        <SectionHeader title={title} count={count}
          trailing={<DisclosureChevron expanded={expanded} color={colors.muted} />} />
      </PressableCard>
      {onBulkAction ? (
        <Button
          density="compact"
          reserveTouchTarget
          label={staged ? copy("Tümünü çıkar", "Unstage all") : copy("Tümünü stage’e al", "Stage all")}
          disabled={busy}
          onPress={onBulkAction}
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
            label={message.trim()
              ? copy("Öneriyi mesajımın altına ekle", "Add suggestion below my message")
              : copy("Öneriyi kullan", "Use suggestion")}
            disabled={busy}
            onPress={() => active.useSuggestion((suggestion) => onChange(gitMergeSuggestion(message, suggestion)))}
          />
        </Notice>
      ) : null}
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
  const { colors, uiStyles } = useMobileTheme();
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
            p0: index.branch || gitDetachedLabel(copy),
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
      {reason && !(primary.kind === "commit" && primary.block === "message") && !busy ? <Body muted selectable={false} style={uiStyles.caption}>{reason}</Body> : null}
    </View>
  );
}
