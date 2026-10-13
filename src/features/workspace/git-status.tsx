import { View } from "react-native";
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
import { colors, metrics, radii, space, fontSize } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { workspaceStyles } from "./shared";
import type {
  GitActionFeedbackProps,
  GitConflictsPanelProps,
  GitHeaderProps,
  GitOperationPanelProps,
  GitSummaryProps,
} from "./git-types";

export function GitHeader({
  index,
  refreshing,
  onRefresh,
  onToggleBranches,
  busy,
}: GitHeaderProps) {
  const copy = useCopy();
  return (
    <View style={{ gap: space.sm }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Heading>{copy("Git", "Git")}</Heading>
        <Body muted numberOfLines={1} style={[uiStyles.caption, { maxWidth: "65%" }]}>
          {index.remote || copy("Çalışma klasörü", "Working folder")}
        </Body>
      </Row>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <PressableCard
          label={copy("Dallar", "Branches")}
          onPress={onToggleBranches}
          disabled={busy}
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            minHeight: metrics.selectionHeight,
            paddingHorizontal: space.md,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radii.control,
            paddingVertical: space.sm,
          }}
        >
          <GitBranch size={17} color={colors.accent} />
          <Body
            selectable={false}
            numberOfLines={1}
            ellipsizeMode="middle"
            style={[uiStyles.grow, { fontSize: fontSize.small, lineHeight: 18, fontWeight: "600" }]}
          >
            {index.branch || copy("Git", "Git")}
          </Body>
          <ChevronDown size={15} color={colors.muted} />
        </PressableCard>
        <IconButton
          label={copy("Yenile", "Refresh")}
          onPress={onRefresh}
          busy={refreshing}
          disabled={busy}
        >
          <RefreshCw size={18} color={colors.muted} />
        </IconButton>
      </View>
    </View>
  );
}

export function GitActionFeedback({
  action,
  extended,
  createBranch,
  switchBranch,
}: GitActionFeedbackProps) {
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

export function GitSummary({ index }: GitSummaryProps) {
  const copy = useCopy();
  if (!index.files.length && !index.ahead && !index.behind) return null;
  return (
    <Row style={{ gap: space.sm }}>
      <Body muted style={uiStyles.caption}>
        {copy("{p0} dosya", "{p0} files", { p0: index.files.length })}
      </Body>
      {index.ahead || index.behind ? (
        <Body muted style={uiStyles.caption}>{`${index.ahead} ↑ · ${index.behind} ↓`}</Body>
      ) : null}
      {index.additions ? <Badge label={`+${index.additions}`} tone="success" /> : null}
      {index.deletions ? <Badge label={`−${index.deletions}`} tone="danger" /> : null}
    </Row>
  );
}

export function GitOperationPanel({
  operation,
  hasConflicts,
  busy,
  onChoose,
  children,
}: GitOperationPanelProps) {
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
