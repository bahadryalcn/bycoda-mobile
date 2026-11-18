import { useMobileTheme } from "@/ui/theme";
import { useState } from "react";
import { Text, View } from "react-native";
import ArrowDownToLine from "lucide-react-native/icons/arrow-down-to-line";
import Check from "lucide-react-native/icons/check";
import Download from "lucide-react-native/icons/download";
import FileText from "lucide-react-native/icons/file-text";
import GitCompare from "lucide-react-native/icons/git-compare";
import Animated from "react-native-reanimated";
import GitBranch from "lucide-react-native/icons/git-branch";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import {
  ActionMenu,
  Badge,
  Body,
  Button,
  Card,
  Heading,
  MutationState,
  PressableCard,
  Row,
} from "@/ui/primitives";
import { pullRequestStateLabel } from "./git-link-pr-model";
import { PullRequestStateBadge } from "./pull-request-state-badge";
import { enterItem } from "@/ui/motion";
import { radii, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import type {
  GitActionFeedbackProps,
  GitConflictsPanelProps,
  GitHeaderProps,
  GitOperationPanelProps,
} from "./git-types";

/** One compact branch row; tapping it opens the git actions sheet. */
export function GitHeader({
  index,
  onOpenActions,
  busy,
  linkedPr,
}: GitHeaderProps & { onOpenActions: () => void }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const name = index.branch || copy("Git", "Git");
  const numbers = new Intl.NumberFormat(useLocale());
  const summary = [name, index.remote,
    copy("{p0} dosya", "{p0} files", { p0: numbers.format(index.files.length) }),
    linkedPr ? `#${linkedPr.number} ${pullRequestStateLabel(linkedPr.state, copy)}` : undefined,
    index.ahead ? `↑${numbers.format(index.ahead)}` : undefined,
    index.behind ? `↓${numbers.format(index.behind)}` : undefined,
  ].filter(Boolean).join(". ");
  return (
    <Animated.View entering={enterItem(0)}>
      <PressableCard
        label={`${copy("Git işlemleri", "Git actions")}: ${summary}`}
        disabled={busy}
        onPress={onOpenActions}
        style={{
          minHeight: 48, flexDirection: "row", alignItems: "center", gap: space.row, paddingVertical: space.row, paddingHorizontal: space.row,
          marginHorizontal: 0, borderRadius: radii.control, backgroundColor: colors.raised,
        }}
      >
        <GitBranch size={18} strokeWidth={2} color={colors.muted} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} ellipsizeMode="middle" style={[uiStyles.label, { fontWeight: "700" }]}>{name}</Text>
          <GitSyncSummary index={index} />
          <Row style={{ gap: space.sm }}>
            {linkedPr ? <PullRequestStateBadge state={linkedPr.state} label={`#${linkedPr.number} · ${pullRequestStateLabel(linkedPr.state, copy)}`} /> : null}
            {index.ahead ? <Text style={[uiStyles.caption, { color: colors.muted }]}>{`↑${numbers.format(index.ahead)}`}</Text> : null}
            {index.behind ? <Text style={[uiStyles.caption, { color: colors.muted }]}>{`↓${numbers.format(index.behind)}`}</Text> : null}
          </Row>
        </View>
        <ChevronDown size={16} color={colors.muted} />
      </PressableCard>
    </Animated.View>
  );
}

function GitSyncSummary({ index }: { index: GitHeaderProps["index"] }) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const numbers = new Intl.NumberFormat(useLocale());
  if (!index.files.length) return null;
  return (
    <Row style={{ gap: space.xs }}>
      <Body muted style={uiStyles.caption}>
        {copy("{p0} dosya", "{p0} files", { p0: numbers.format(index.files.length) })}
        {index.additions ? <Body style={[uiStyles.caption, { color: colors.diffAddText }]}>{` · +${numbers.format(index.additions)}`}</Body> : null}
        {index.deletions ? <Body style={[uiStyles.caption, { color: colors.diffDelText }]}>{` · −${numbers.format(index.deletions)}`}</Body> : null}
      </Body>
    </Row>
  );
}

export function GitActionFeedback({
  action,
  extended,
  createBranch,
  switchBranch,
}: GitActionFeedbackProps) {
  useMobileTheme();
  const copy = useCopy();
  return (
    <>
      <MutationState
        mutation={action}
        success={copy("Git işlemi tamamlandı.", "Git action completed.")}
      />
      <MutationState
        mutation={extended}
        success={copy("Çalışma klasörü güncellendi.", "Working folder updated.")}
      />
      <MutationState
        mutation={createBranch}
        success={copy("Dal oluşturuldu.", "Branch created.")}
      />
      <MutationState
        mutation={switchBranch}
        success={copy("Dal değiştirildi.", "Branch changed.")}
      />
    </>
  );
}

export function GitOperationPanel({
  operation,
  hasConflicts,
  busy,
  onChoose,
  children,
}: GitOperationPanelProps) {
  useMobileTheme();
  const copy = useCopy();
  return (
    <Card>
      <Heading>{`${copy("Devam eden Git işlemi:", "Git operation in progress:")} ${operation}`}</Heading>
      <Body muted>
        {copy(
          "Çakışmaları düzenle, çözülmüş dosyaları stage’e al ve işlemi devam ettir. İptal etmek işlem başlamadan önceki duruma döner.",
          "Edit conflicts, stage resolved files, then continue. Aborting returns to the state before this operation.",
        )}
      </Body>
      <Row>
        <Button
          label={copy("İşlemi devam ettir", "Continue operation")}
          disabled={hasConflicts || busy}
          onPress={() => onChoose({ kind: "operation", choice: "continue" })}
        />
        <Button
          label={copy("İşlemi iptal et", "Abort operation")}
          tone="danger"
          disabled={busy}
          onPress={() => onChoose({ kind: "operation", choice: "abort" })}
        />
      </Row>
      {children}
    </Card>
  );
}

const CONFLICT_PREVIEW = 3;

/** Bounded: shows a few conflicting files and expands on demand, so the list header never grows unbounded. */
export function GitConflictsPanel({
  files,
  canResolve,
  busy,
  onOpenFile,
  onStageFile,
  onChoose,
  onReview,
  children,
}: GitConflictsPanelProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const numbers = new Intl.NumberFormat(useLocale());
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? files : files.slice(0, CONFLICT_PREVIEW);
  return (
    <Card>
      <Row>
        <Heading>{copy("Çakışmalar", "Conflicts")}</Heading>
        <Badge label={numbers.format(files.length)} tone="danger" />
      </Row>
      <Body muted>
        {copy(
          "Commit öncesinde bu dosyalardaki çakışmaları çöz. Bir tarafı seçmek diğer tarafın değişikliklerini bırakır.",
          "Resolve these conflicts before committing. Choosing one side discards the other side’s changes.",
        )}
      </Body>
      {shown.map((file) => {
        const normalized = file.relative.replaceAll("\\", "/");
        const cut = normalized.lastIndexOf("/");
        return (
          <View key={file.relative} style={{ flexDirection: "row", alignItems: "center", gap: space.row, minHeight: 48 }}>
            <View style={[uiStyles.grow, { gap: space.xxs }]}>
              <Body numberOfLines={2} ellipsizeMode="middle" style={{ fontWeight: "600" }}>
                {normalized.slice(cut + 1)}
              </Body>
              {cut > 0 ? (
                <Body muted numberOfLines={1} ellipsizeMode="middle" style={uiStyles.caption}>
                  {normalized.slice(0, cut)}
                </Body>
              ) : null}
            </View>
            <Badge label={copy("Çakışma", "Conflict")} tone="danger" />
            <ActionMenu
              label={file.relative}
              busy={busy}
              actions={[
                onReview && {
                  key: "review",
                  label: copy("Sürümleri incele", "Review versions"),
                  icon: <GitCompare size={18} color={colors.muted} />,
                  disabled: busy,
                  onPress: () => onReview(file.relative),
                },
                {
                  key: "file",
                  label: copy("Dosyayı incele", "Review file"),
                  icon: <FileText size={18} color={colors.muted} />,
                  disabled: busy,
                  onPress: () => onOpenFile(file.relative),
                },
                {
                  key: "stage",
                  label: copy("Düzenlenmiş dosyayı stage’e al", "Stage edited file"),
                  icon: <ArrowDownToLine size={18} color={colors.muted} />,
                  disabled: busy,
                  onPress: () => onStageFile(file.relative),
                },
                canResolve && {
                  key: "ours",
                  label: copy("Bizim sürüm", "Our version"),
                  icon: <Check size={18} color={colors.muted} />,
                  disabled: busy,
                  destructive: true,
                  onPress: () => onChoose({ kind: "resolve", path: file.relative, side: "ours" }),
                },
                canResolve && {
                  key: "theirs",
                  label: copy("Gelen sürüm", "Incoming version"),
                  icon: <Download size={18} color={colors.muted} />,
                  disabled: busy,
                  destructive: true,
                  onPress: () => onChoose({ kind: "resolve", path: file.relative, side: "theirs" }),
                },
              ]}
            />
          </View>
        );
      })}
      {files.length > CONFLICT_PREVIEW ? (
        <Button
          tone="quiet"
          density="compact"
          label={
            expanded
              ? copy("Daha az göster", "Show fewer")
              : copy("{p0} çakışmanın tümünü göster", "Show all {p0} conflicts", { p0: numbers.format(files.length) })
          }
          onPress={() => setExpanded((value) => !value)}
          style={{ alignSelf: "flex-start" }}
        />
      ) : null}
      {children}
    </Card>
  );
}
