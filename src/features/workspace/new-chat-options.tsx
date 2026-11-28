import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import FileIcon from "lucide-react-native/icons/file";
import FolderTree from "lucide-react-native/icons/folder-tree";
import GitBranch from "lucide-react-native/icons/git-branch";
import ImageIcon from "lucide-react-native/icons/image";
import Plus from "lucide-react-native/icons/plus";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import { carryCrossDelegation } from "../../../../src/shared/model/host-contracts/delegation";
import type { HostModelCatalog } from "@/domain/types";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { ChatToolbarAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { Body, NavigationGroup, NavigationRow, PressableArea, QueryState, RowIcon, Sheet } from "@/ui/primitives";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import { useMobileTheme } from "@/ui/theme";
import { metrics, space } from "@/ui/tokens";
import { ComposerAccessField, accessModeLabel } from "./composer-access";
import type { RuntimeMode } from "./creation-selection";
import { ModelPicker } from "./model-picker";
import { settingsSummary } from "./model-picker-model";
import type { ProviderChoice } from "./provider-choices";
import type { RecentModel } from "./recent-models";
import type { ProjectWorktrees } from "./project-screen-types";
import { settingLabels } from "./setting-labels";
import { newChatCheckoutAvailable } from "./new-chat-model";
import type { AgentModel } from "../../../../src/features/sessions/model/models";
import { WorktreeCreate } from "./worktree-create";

/**
 * The model slot of the new-session composer: the same toolbar chip and grouped model picker as an
 * open session, editing the draft directly (nothing is saved until the first message creates it).
 * Access sits in the same sheet ("Model and access"), as on an open session; agents without
 * access modes (`fx`) pass no `access`.
 */
export function NewChatModelChip({
  iconOnly,
  ready,
  catalogState,
  catalog,
  choices,
  choice,
  models,
  model,
  settings,
  access,
  disabled,
  onRetry,
  onChooseProvider,
  onChooseModel,
  onChange,
  recents,
}: {
  iconOnly: boolean;
  ready: boolean;
  /** Why no model can be chosen yet; undefined once the catalog offers one. */
  catalogState?: "loading" | "waiting" | "error" | "empty";
  catalog?: HostModelCatalog;
  choices: readonly ProviderChoice[];
  choice?: ProviderChoice;
  models: readonly AgentModel[];
  model: string;
  settings: Record<string, string>;
  /** The access mode the create sends; omitted where the chosen agent has none. */
  access?: {
    value: RuntimeMode;
    unavailable: Partial<Record<RuntimeMode, string>>;
    onChange: (mode: RuntimeMode) => void;
  };
  disabled: boolean;
  onRetry: () => void;
  onChooseProvider: (choice: ProviderChoice) => void;
  onChooseModel: (choice: ProviderChoice, model: string, settings: Record<string, string>) => void;
  onChange: (model: string, settings: Record<string, string>) => void;
  /** Models recently used on this computer, offered as one-tap rows in the picker. */
  recents?: readonly RecentModel[];
}) {
  const copy = useCopy();
  const { fontScale } = useWindowDimensions();
  const { colors } = useMobileTheme();
  const [open, setOpen] = useState(false);
  if (!ready || catalogState) {
    const label = catalogState === "error"
      ? copy("Model listesi yüklenemedi.", "Models could not be loaded.")
      : catalogState === "empty"
        ? copy("Kullanılabilir ajan veya model yok.", "No agent or model available.")
        : catalogState === "waiting"
          ? copy("Model listesi için bağlantı bekleniyor.", "Waiting for a connection to load models.")
          : copy("Model yükleniyor…", "Loading model…");
    return (
      <ChatToolbarAction
        label={label}
        hideLabel={iconOnly}
        reserveTouchTarget
        busy={catalogState === "loading" || !ready}
        // A failed or paused catalog read is its own retry, like the composer's other status chips.
        disabled={disabled || catalogState === "empty"}
        onPress={onRetry}
      />
    );
  }
  const selected = models.find((entry) => entry.id === model || entry.nativeId === model);
  const name = selected?.name ?? (model || copy("Model seç…", "Select model…"));
  const summary = settingsSummary(selected, settings, settingLabels(copy));
  const shown = summary ? `${name} · ${summary}` : name;
  const title = access ? copy("Model ve erişim", "Model and access") : copy("Model", "Model");
  const spoken = [
    [shown, choice?.label].filter(Boolean).join(", "),
    access ? `${copy("Erişim", "Access")}: ${accessModeLabel(access.value, copy)}` : "",
  ].filter(Boolean).join(". ");
  // Full access is the one mode that stays visible on the chip, as on an open session.
  const fullAccess = access?.value === "full-access";
  return (
    <>
      <ChatToolbarAction
        label={fontScale >= 1.35 ? name : shown}
        hideLabel={iconOnly}
        reserveTouchTarget
        accessibilityLabel={`${title}: ${spoken}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
      >
        {choice || fullAccess ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
            {choice ? <ProviderAccountMark provider={choice.provider} color={choice.color} size={16} /> : null}
            {fullAccess ? <ShieldAlert size={14} strokeWidth={2.2} color={colors.warning} /> : null}
          </View>
        ) : null}
      </ChatToolbarAction>
      <ModelPicker
        title={title}
        extra={access ? (
          <ComposerAccessField
            value={access.value}
            saved={access.value}
            unavailable={access.unavailable}
            disabled={disabled}
            onChange={access.onChange}
          />
        ) : undefined}
        visible={open}
        onClose={() => setOpen(false)}
        catalog={catalog}
        choices={choices}
        choice={choice}
        models={models}
        model={model}
        settings={settings}
        sparseSettings
        disabled={disabled}
        recents={recents}
        accountUsage
        onChooseProvider={onChooseProvider}
        onChooseModel={onChooseModel}
        onChange={onChange}
      />
    </>
  );
}

/** Resets settings that only the previous provider understood when the agent changes. */
export function carriedSettings(previous: Record<string, string>, changedProvider: boolean) {
  return changedProvider ? carryCrossDelegation(previous, {}) : previous;
}

/** Label of the folder a new session opens in: the worktree's branch, else the main project folder. */
export function checkoutLabel(cwd: string | undefined, trees: ProjectWorktrees | undefined, copy: ReturnType<typeof useCopy>) {
  if (!cwd) return copy("Ana proje klasörü", "Main project folder");
  const tree = trees?.worktrees.find((item) => item.path === cwd);
  return tree?.branch || cwd.split(/[\\/]/).filter(Boolean).at(-1) || cwd;
}

/**
 * Where the session works: the main project folder, an existing worktree or a new one. The same
 * "Working folder" choice as the project screen, as one quiet row of the hero under the project;
 * it only appears where the project can offer one.
 */
export function NewChatCheckoutRow({
  machineId,
  project,
  cwd,
  disabled,
  onChange,
}: {
  machineId: string;
  project: { id: string; cwd: string };
  /** The chosen worktree; undefined is the main project folder. */
  cwd?: string;
  disabled: boolean;
  onChange: (cwd: string | undefined) => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const machine = useActiveMachine();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const trees = useHostQuery<ProjectWorktrees>(["worktrees", project.id], "git.worktrees", { projectId: project.id });
  const canCreate = !!machine?.capabilities?.includes("git.worktreeCreate");
  const others = (trees.data?.worktrees ?? []).filter((tree) => !tree.missing && !tree.isMain);
  // A folder that is not a Git repository has no worktrees: the Host refuses the listing.
  if (!newChatCheckoutAvailable({ cwd, canCreate, trees: trees.data })) return null;
  const label = checkoutLabel(cwd, trees.data, copy);
  const options = [
    { value: "", label: copy("Ana proje klasörü", "Main project folder"), detail: project.cwd },
    ...others.map((tree) => ({ value: tree.path, label: tree.branch || copy("Çalışma ağacı", "Worktree"), detail: tree.path })),
  ];
  return (
    <>
      <PressableArea
        label={`${copy("Çalışma klasörü", "Working folder")}: ${label}. ${copy("Klasörü değiştir", "Change folder")}`}
        expanded={open}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={{
          minHeight: metrics.touchTarget,
          maxWidth: "100%",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: space.xs,
          paddingHorizontal: space.sm,
        }}
      >
        {cwd ? (
          <GitBranch size={16} strokeWidth={2} color={colors.muted} style={{ flexShrink: 0 }} />
        ) : (
          <FolderTree size={16} strokeWidth={2} color={colors.muted} style={{ flexShrink: 0 }} />
        )}
        <Body muted selectable={false} style={{ flexShrink: 1, textAlign: "center" }}>
          {label}
        </Body>
        <ChevronDown size={14} strokeWidth={2.4} color={colors.muted} style={{ flexShrink: 0 }} />
      </PressableArea>
      <Sheet visible={open} title={copy("Çalışma klasörü", "Working folder")} size="compact" onClose={() => setOpen(false)}>
        <QueryState query={trees} loading="inline" />
        <NavigationGroup>
          {options.map((option) => (
            <NavigationRow
              key={option.value || "main"}
              intent="select"
              label={option.label}
              detail={option.detail}
              detailEllipsizeMode="middle"
              icon={<RowIcon glyph={option.value ? GitBranch : FolderTree} />}
              selected={(cwd ?? "") === option.value}
              disabled={disabled}
              onPress={() => {
                onChange(option.value || undefined);
                setOpen(false);
              }}
            />
          ))}
          {canCreate ? (
            <NavigationRow
              intent="command"
              label={copy("Çalışma ağacı oluştur", "Create worktree")}
              icon={<RowIcon glyph={Plus} />}
              disabled={disabled}
              onPress={() => {
                setOpen(false);
                setCreating(true);
              }}
            />
          ) : null}
        </NavigationGroup>
      </Sheet>
      <WorktreeCreate
        key={`${machineId}:${project.id}`}
        scope={{ machineId, projectId: project.id }}
        visible={creating}
        blocked={disabled}
        beforeChange={async () => {}}
        onSelect={(path) => onChange(path)}
        onClose={() => setCreating(false)}
      />
    </>
  );
}

/**
 * "Add to message" on a new session: photos and files. Templates and turn modes belong to an open
 * session's composer, so they appear once the session exists.
 */
export function NewChatAttachSheet({
  visible,
  onClose,
  onChoose,
}: {
  visible: boolean;
  onClose: () => void;
  onChoose: (kind: "photo" | "document") => void;
}) {
  const copy = useCopy();
  return (
    <Sheet visible={visible} title={copy("Mesaja ekle", "Add to message")} size="compact" onClose={onClose}>
      <NavigationGroup>
        <NavigationRow
          label={copy("Fotoğraflar", "Photos")}
          intent="command"
          icon={<RowIcon glyph={ImageIcon} />}
          onPress={() => onChoose("photo")}
        />
        <NavigationRow
          label={copy("Dosyalar", "Files")}
          intent="command"
          icon={<RowIcon glyph={FileIcon} />}
          onPress={() => onChoose("document")}
        />
      </NavigationGroup>
    </Sheet>
  );
}

