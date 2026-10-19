import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import GitBranch from "lucide-react-native/icons/git-branch";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import {
  Badge,
  Body,
  Button,
  Card,
  Heading,
  IconButton,
  MutationState,
  PressableCard,
  Row,
} from "@/ui/primitives";
import { enterItem } from "@/ui/motion";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { IconTile } from "@/ui/icon-tile";
import { workspaceStyles } from "./shared";
import type {
  GitActionFeedbackProps,
  GitConflictsPanelProps,
  GitHeaderProps,
  GitOperationPanelProps,
} from "./git-types";

/** Branch, sync state and the primary commit/sync entry share one compact summary card. */
export function GitHeader({
  index,
  refreshing,
  onRefresh,
  onToggleBranches,
  onOpenActions,
  busy,
}: GitHeaderProps & { onOpenActions: () => void }) {
  useMobileTheme();
  const copy = useCopy();
  return (
    <Animated.View entering={enterItem(0)}>
      <Card>
        <Row style={{ flexWrap: "nowrap" }}>
          <PressableCard
            label={copy("Dallar", "Branches")}
            onPress={onToggleBranches}
            disabled={busy}
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
              gap: space.row,
              padding: 0,
              borderWidth: 0,
              borderTopStartRadius: 0,
              borderTopEndRadius: 0,
              borderBottomStartRadius: 0,
              borderBottomEndRadius: 0,
              backgroundColor: colors.panel,
            }}
          >
            <IconTile color={colors.accent}>
              <GitBranch size={18} strokeWidth={2} color={colors.accent} />
            </IconTile>
            <View style={[uiStyles.grow, { gap: 2 }]}>
              <Body numberOfLines={1} ellipsizeMode="middle" style={uiStyles.title}>
                {index.branch || copy("Git", "Git")}
              </Body>
              <Body muted numberOfLines={1} ellipsizeMode="middle" style={uiStyles.caption}>
                {index.remote || copy("Çalışma klasörü", "Working folder")}
              </Body>
            </View>
            <ChevronDown size={15} color={colors.tertiary} />
          </PressableCard>
          <IconButton
            label={copy("Yenile", "Refresh")}
            onPress={onRefresh}
            busy={refreshing}
            disabled={busy}
          >
            <RefreshCw size={18} color={colors.muted} />
          </IconButton>
        </Row>
        <GitSyncBadges index={index} />
        <Button
          label={copy("Commit ve eşitleme", "Commit and sync")}
          tone="primary"
          density="compact"
          disabled={busy}
          onPress={onOpenActions}
          style={{ alignSelf: "flex-start" }}
        />
      </Card>
    </Animated.View>
  );
}

function GitSyncBadges({ index }: { index: GitHeaderProps["index"] }) {
  useMobileTheme();
  const copy = useCopy();
  if (!index.files.length && !index.ahead && !index.behind) return null;
  return (
    <Row style={{ gap: space.xs }}>
      <Badge label={copy("{p0} dosya", "{p0} files", { p0: index.files.length })} />
      {index.ahead ? <Badge label={`↑ ${index.ahead}`} tone="info" /> : null}
      {index.behind ? <Badge label={`↓ ${index.behind}`} tone="warning" /> : null}
      {index.additions ? <Badge label={`+${index.additions}`} tone="success" /> : null}
      {index.deletions ? <Badge label={`−${index.deletions}`} tone="danger" /> : null}
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
            <Button
              label={copy("Dosyayı düzenle", "Edit file")}
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
