import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import GitBranch from "lucide-react-native/icons/git-branch";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import {
  Badge,
  Body,
  Button,
  Card,
  Heading,
  IconButton,
  MutationState,
  NavigationRow,
  Row,
} from "@/ui/primitives";
import { enterItem } from "@/ui/motion";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { workspaceStyles } from "./shared";
import type {
  GitActionFeedbackProps,
  GitConflictsPanelProps,
  GitHeaderProps,
  GitOperationPanelProps,
} from "./git-types";

/** Branch identity leads; sync state and the next action share one wrapping toolbar. */
export function GitHeader({
  index,
  refreshing,
  onRefresh,
  onToggleBranches,
  onOpenActions,
  navigationActions,
  busy,
}: GitHeaderProps & { onOpenActions: () => void }) {
  useMobileTheme();
  const copy = useCopy();
  const remote = index.branch && index.remote?.endsWith(`/${index.branch}`)
    ? index.remote.slice(0, -index.branch.length - 1)
    : index.remote;
  return (
    <Animated.View entering={enterItem(0)}>
      <View style={{ gap: space.xs }}>
        <Row>
          <View style={{ flexBasis: 240, flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
            <NavigationRow
              label={index.branch || copy("Git", "Git")}
              detail={remote || copy("Çalışma klasörü", "Working folder")}
              detailLines={0}
              icon={<GitBranch size={18} strokeWidth={2} color={colors.accent} />}
              accessibilityLabel={`${copy("Dallar", "Branches")}: ${[index.branch || copy("Git", "Git"), index.remote].filter(Boolean).join(" · ")}`}
              onPress={onToggleBranches}
              disabled={busy}
            />
          </View>
          <Row style={{ gap: space.xs, flexGrow: 1, flexShrink: 1, maxWidth: "100%" }}>
            <Button
              label={copy("Commit ve eşitleme", "Commit and sync")}
              tone="primary"
              density="compact"
              disabled={busy}
              onPress={onOpenActions}
              style={{ alignSelf: "flex-start", marginEnd: "auto" }}
            />
            <Row style={{ flexWrap: "nowrap", marginStart: "auto" }}>
              <IconButton label={copy("Yenile", "Refresh")} onPress={onRefresh} busy={refreshing} disabled={busy}>
                <RefreshCw size={18} color={colors.muted} />
              </IconButton>
              {navigationActions}
            </Row>
          </Row>
        </Row>
        <GitSyncSummary index={index} />
      </View>
    </Animated.View>
  );
}

function GitSyncSummary({ index }: { index: GitHeaderProps["index"] }) {
  useMobileTheme();
  const copy = useCopy();
  if (!index.files.length && !index.ahead && !index.behind) return null;
  return (
    <Row style={{ gap: space.xs }}>
      <Body muted style={uiStyles.caption}>
        {copy("{p0} dosya", "{p0} files", { p0: index.files.length })}
        {index.additions ? <Body style={[uiStyles.caption, { color: colors.success }]}>{` · +${index.additions}`}</Body> : null}
        {index.deletions ? <Body style={[uiStyles.caption, { color: colors.danger }]}>{` · −${index.deletions}`}</Body> : null}
      </Body>
      {index.ahead ? <Badge label={`↑ ${index.ahead}`} tone="info" /> : null}
      {index.behind ? <Badge label={`↓ ${index.behind}`} tone="warning" /> : null}
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
  useMobileTheme();
  const copy = useCopy();
  return (
    <Card>
      <Heading>{copy("Çakışmalar", "Conflicts")}</Heading>
      <Body muted>
        {copy(
          "Commit öncesinde bu dosyalardaki çakışmaları çöz. Bir tarafı seçmek diğer tarafın değişikliklerini bırakır.",
          "Resolve these conflicts before committing. Choosing one side discards the other side’s changes.",
        )}
      </Body>
      {files.map((file) => (
        <View key={file.relative} style={workspaceStyles.stack}>
          <Body mono>{file.relative}</Body>
          <Row>
            {onReview ? <Button label={copy("Sürümleri incele", "Review versions")} disabled={busy} onPress={() => onReview(file.relative)} /> : null}
            <Button
              label={copy("Dosyayı incele", "Review file")}
              disabled={busy}
              onPress={() => onOpenFile(file.relative)}
            />
            <Button
              label={copy("Düzenlenmiş dosyayı stage’e al", "Stage edited file")}
              busy={busy}
              onPress={() => onStageFile(file.relative)}
            />
          </Row>
          {canResolve ? (
            <Row>
              <Button
                label={copy("Bizim sürüm", "Our version")}
                disabled={busy}
                onPress={() => onChoose({ kind: "resolve", path: file.relative, side: "ours" })}
              />
              <Button
                label={copy("Gelen sürüm", "Incoming version")}
                disabled={busy}
                onPress={() => onChoose({ kind: "resolve", path: file.relative, side: "theirs" })}
              />
            </Row>
          ) : null}
        </View>
      ))}
      {children}
    </Card>
  );
}
