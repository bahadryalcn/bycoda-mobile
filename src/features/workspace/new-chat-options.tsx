import { useState, type ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import FolderTree from "lucide-react-native/icons/folder-tree";
import GitBranch from "lucide-react-native/icons/git-branch";
import Lock from "lucide-react-native/icons/lock";
import Pencil from "lucide-react-native/icons/pencil";
import Plus from "lucide-react-native/icons/plus";
import Shield from "lucide-react-native/icons/shield";
import ShieldAlert from "lucide-react-native/icons/shield-alert";
import Sparkles from "lucide-react-native/icons/sparkles";
import { carryCrossDelegation } from "../../../../src/shared/model/host-contracts/delegation";
import type { HostModelCatalog } from "@/domain/types";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { ChatToolbarAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { NavigationGroup, NavigationRow, QueryState, RowIcon, Sheet } from "@/ui/primitives";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import { ScopePill } from "@/ui/scope-pill";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { accessModeLabel } from "./composer-access";
import { ACCESS_MODES } from "./composer-access-model";
import type { RuntimeMode } from "./creation-selection";
import { ModelPicker } from "./model-picker";
import { settingsSummary } from "./model-picker-model";
import type { ProviderChoice } from "./provider-choices";
import type { ProjectWorktrees } from "./project-screen-types";
import { settingLabels } from "./setting-labels";
import { newChatCheckoutAvailable } from "./new-chat-model";
import type { AgentModel } from "../../../../src/features/sessions/model/models";
import { WorktreeCreate } from "./worktree-create";

const accessGlyph = { supervised: Lock, "auto-accept-edits": Pencil, auto: Sparkles, "full-access": Shield } as const;

/**
 * The model slot of the new-session composer: the same toolbar chip and grouped model picker as an
 * open session, editing the draft directly (nothing is saved until the first message creates it).
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
  disabled,
  onRetry,
  onChooseProvider,
  onChooseModel,
  onChange,
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
  disabled: boolean;
  onRetry: () => void;
  onChooseProvider: (choice: ProviderChoice) => void;
  onChooseModel: (choice: ProviderChoice, model: string, settings: Record<string, string>) => void;
  onChange: (model: string, settings: Record<string, string>) => void;
}) {
  const copy = useCopy();
  const { fontScale } = useWindowDimensions();
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
  return (
    <>
      <ChatToolbarAction
        label={fontScale >= 1.35 ? name : shown}
        hideLabel={iconOnly}
        reserveTouchTarget
        accessibilityLabel={`${copy("Model", "Model")}: ${[shown, choice?.label].filter(Boolean).join(", ")}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
      >
        {choice ? <ProviderAccountMark provider={choice.provider} color={choice.color} size={16} /> : null}
      </ChatToolbarAction>
      <ModelPicker
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

/** Access (permission mode) as a scope chip; the sheet lists the same four modes as the session's model sheet. */
export function NewChatAccessChip({
  value,
  unavailable,
  disabled,
  onChange,
}: {
  value: RuntimeMode;
  unavailable: Partial<Record<RuntimeMode, string>>;
  disabled: boolean;
  onChange: (mode: RuntimeMode) => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const [open, setOpen] = useState(false);
  const label = accessModeLabel(value, copy);
  const hint = (mode: RuntimeMode) =>
    mode === "supervised"
      ? copy("Komutlardan ve dosya değişikliklerinden önce sorar.", "Ask before commands and file changes.")
      : mode === "auto-accept-edits"
        ? copy("Düzenlemeleri otomatik onaylar, diğer işlemlerden önce sorar.", "Auto-approve edits, ask before other actions.")
        : mode === "auto"
          ? copy("Bir AI inceleyici işlemleri onaylayabilir veya reddedebilir.", "An AI reviewer can approve or deny actions.")
          : copy(
              "Ajan komutları ve düzenlemeleri onay beklemeden uygulayabilir.",
              "The agent may run commands and edits without waiting for approval.",
            );
  const Glyph = value === "full-access" ? ShieldAlert : accessGlyph[value];
  return (
    <>
      <ScopePill
        icon={<Glyph size={14} strokeWidth={2} color={value === "full-access" ? colors.warning : colors.muted} />}
        label={label}
        accessibilityLabel={`${copy("Erişim", "Access")}: ${label}. ${copy("Erişimi değiştir", "Change access")}`}
        expanded={open}
        disabled={disabled}
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} title={copy("Erişim", "Access")} size="compact" onClose={() => setOpen(false)}>
        <NavigationGroup>
          {ACCESS_MODES.map((mode) => {
            const refused = mode !== value ? unavailable[mode] : undefined;
            return (
              <NavigationRow
                key={mode}
                intent="select"
                selected={mode === value}
                disabled={disabled || !!refused}
                icon={<RowIcon glyph={accessGlyph[mode]} />}
                label={accessModeLabel(mode, copy)}
                detail={refused ?? hint(mode)}
                detailLines={0}
                detailSelectable={false}
                onPress={() => {
                  if (!refused) onChange(mode);
                  setOpen(false);
                }}
              />
            );
          })}
        </NavigationGroup>
      </Sheet>
    </>
  );
}

/** Label of the folder a new session opens in: the worktree's branch, else the main project folder. */
export function checkoutLabel(cwd: string | undefined, trees: ProjectWorktrees | undefined, copy: ReturnType<typeof useCopy>) {
  if (!cwd) return copy("Ana proje klasörü", "Main project folder");
  const tree = trees?.worktrees.find((item) => item.path === cwd);
  return tree?.branch || cwd.split(/[\\/]/).filter(Boolean).at(-1) || cwd;
}

/**
 * Where the session works: the main project folder, an existing worktree or a new one. The same
 * "Working folder" choice as the project screen; it only appears where the project can offer one.
 */
export function NewChatCheckoutChip({
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
      <ScopePill
        icon={cwd ? <GitBranch size={14} strokeWidth={2} color={colors.muted} /> : <FolderTree size={14} strokeWidth={2} color={colors.muted} />}
        label={label}
        accessibilityLabel={`${copy("Çalışma klasörü", "Working folder")}: ${label}. ${copy("Klasörü değiştir", "Change folder")}`}
        expanded={open}
        disabled={disabled}
        onPress={() => setOpen(true)}
      />
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

/** One wrapping row of the draft's options above the composer, aligned with the capsule. */
export function NewChatOptionRow({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm, paddingHorizontal: space.xs }}>
      {children}
    </View>
  );
}
