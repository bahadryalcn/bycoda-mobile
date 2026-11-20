import type { ComponentType, PropsWithChildren, ReactNode, RefObject, Ref } from "react";
import type {
  StyleProp,
  TextInputProps,
  TextProps,
  ViewStyle,
  HostInstance,
  TextInputInstance,
} from "react-native";
import type { SemanticTone } from "./tokens";
import type { QueryLike } from "./query-presentation";
import type { usePullRefresh } from "./use-pull-refresh";
import type { IllustrationName } from "./illustrations";

export type ContainerProps = PropsWithChildren<{ style?: StyleProp<ViewStyle> }>;

export type CardProps = ContainerProps & {
  /** Ordinary sections stay unboxed. Use surface only for a distinct task region. */
  variant?: "plain" | "surface";
};

export type ButtonProps = PropsWithChildren<{
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  selected?: boolean;
  tone?: "default" | "primary" | "secondary" | "quiet" | SemanticTone;
  density?: "regular" | "compact";
  fullWidth?: boolean;
  /** Text-style button at the start of a content column: pulls its padding outside the column so the label aligns with the content (touch target unchanged). */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

export type InputProps = TextInputProps & {
  ref?: Ref<TextInputInstance>;
  label: string;
  mono?: boolean;
  hint?: string;
  /** Explanation revealed by an info icon beside the label, however short; never printed under the control. */
  info?: string;
  error?: string;
  tone?: "default" | SemanticTone;
  /** Fills the height its parent gives; the editor then owns the only scroller. */
  fill?: boolean;
};

export type ScreenProps = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  /** Current task scope in the shared heading, preserved under a native title. */
  context?: ReactNode;
  /** Trailing actions in the shared page heading. */
  actions?: ReactNode;
  /** In-screen back control, shown only when no native header owns navigation. */
  onBack?: () => void;
  /**
   * Non-scrolling pages: their content reserves the home-indicator inset itself (a keyboard-aware composer), so
   * the frame keeps only the dock clearance. Horizontal gutters stay the content's, via `useScreenContentInsets`.
   */
  contentOwnsBottomInset?: boolean;
  scroll?: boolean;
  query?: QueryLike;
  refresh?: () => unknown;
  /** Share manual refresh state with the page toolbar; polling stays quiet. */
  refreshState?: ReturnType<typeof usePullRefresh>;
  /** Padded scrolling viewport, excluding fixed footer space. Consumers measure their own content. */
  onContentViewport?: (size: { width: number; height: number }) => void;
  /** Reachable page actions outside the page scroller; editors keep their own Sheet. */
  footer?: ReactNode;
}>;

export type BodyProps = PropsWithChildren<TextProps & { muted?: boolean; mono?: boolean }>;

export type TextContentProps = PropsWithChildren<TextProps>;

export type SectionProps = PropsWithChildren<{ title: string }>;

export type ChoiceChipProps = Omit<ButtonProps, "children" | "selected"> & { selected: boolean };

export type ToggleFieldProps = {
  label: string;
  /** Leading icon tile, aligned with NavigationRow icons in settings groups. */
  icon?: ReactNode;
  /** Deliberate list preview; the accessible label retains its full text. */
  labelLines?: number;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Short value-like status shown under the label (a current value or state). */
  detail?: string;
  /** An explanation: hidden behind an info icon until tapped. */
  help?: string;
  tone?: "default" | SemanticTone;
};

export type PressableCardProps = ContainerProps & {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  /** Secondary actions; `optionsLabel` also exposes them as a screen-reader custom action. */
  onLongPress?: () => void;
  optionsLabel?: string;
  /** What the card is to assistive tech: a tab, a radio choice, a picker trigger or an image; defaults to button. */
  role?: "button" | "tab" | "radio" | "combobox" | "imagebutton";
  /** Extends the touch target of a visually small card to the 48dp minimum. */
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
};

export type SelectRowProps = {
  label: string;
  detail?: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
};

export type IconButtonProps = PropsWithChildren<{
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  density?: "regular" | "compact";
  tone?: "default" | "primary" | "danger";
  expanded?: boolean;
}>;

export type BadgeProps = { label: string; tone?: "default" | SemanticTone | "live" | "active"; /** Optional leading glyph (a lucide icon component), drawn 12dp in the badge ink; decorative, the label carries the meaning. */ icon?: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>; };

/** Button-shaped recovery or next step shown by a state. */
export type StateAction = { label: string; onPress: () => void; busy?: boolean };

export type StateTone = "neutral" | SemanticTone;

export type StateViewProps = {
  /** Calm line art for full-area states. Without it a tone icon is used. */
  illustration?: IllustrationName;
  title: string;
  description?: string;
  /** Primary next step. */
  action?: StateAction;
  /** Quiet alternative below the primary action. */
  secondaryAction?: StateAction;
  /** Inline, left-aligned variant (icon row) for small sub-sections. With an illustration it stays centered but smaller. */
  compact?: boolean;
  tone?: StateTone;
  testID?: string;
};

export type EmptyProps = {
  title: string;
  detail?: string;
  /** Defaults to true (inline with icon). Pass false for a centered full-area state. */
  compact?: boolean;
  action?: StateAction;
  secondaryAction?: StateAction;
  illustration?: IllustrationName;
};

export type UnsavedBadgeProps = { label?: string };

export type FieldErrorProps = { message: string };

export type LoadingProps = { label?: string; centered?: boolean; showLabel?: boolean; immediate?: boolean };

export type ErrorTextProps = { error: unknown; message?: string };

export type ErrorNoticeProps = PropsWithChildren<{
  error: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  message?: string;
  action?: { label: string; onPress: () => void };
}>;

export type NoticeProps = PropsWithChildren<{
  tone?: "info" | "warning" | "success" | "danger";
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  action?: { label: string; onPress: () => void };
}>;

export type QueryStateProps = {
  query: QueryLike;
  /** Overrides the default nearest-Sheet guarded close and connection navigation. */
  onManageConnections?: () => void;
  empty?: boolean | string;
  emptyTitle?: string;
  emptyDetail?: string;
  emptyAction?: EmptyProps["action"];
  /** Illustration for the empty state; defaults to "search-empty" when `searching`. */
  emptyIllustration?: IllustrationName;
  /** A search or filter is active, so empty means "no matches". */
  searching?: boolean;
  /** The device itself has no network; selects the offline illustration for errors. */
  offline?: boolean;
  /** "list"/"content" draw a skeleton of that shape; "centered" a spinner in the region. */
  loading?: "list" | "content" | "inline" | "centered" | "none";
  loadingLabel?: string;
};

export type MutationStateProps = {
  mutation: { isPending?: boolean; isError?: boolean; isSuccess?: boolean; error?: unknown; submittedAt?: number };
  pending?: string;
  success?: string;
};

export type FormActionsProps = {
  /** Operation feedback stays beside actions; field errors remain in the form. */
  feedback?: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  cancelDisabled?: boolean;
  /** Read-only recovery may close while a read is pending; mutations keep the default guard. */
  allowCancelWhileBusy?: boolean;
  busy?: boolean;
  disabled?: boolean;
  tone?: ButtonProps["tone"];
  /** Shows the compact "Unsaved changes" pill above the actions. */
  dirty?: boolean;
};

export type ConfirmationCardProps = PropsWithChildren<{
  message?: string;
  cancelLabel: string;
  onCancel: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: ButtonProps["tone"];
  additionalActions?: ReactNode;
}>;

export type CodePanelProps = ContainerProps & { horizontal?: boolean };

export type SheetProps = PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  headerAction?: ReactNode;
  /** Form fits scrolling content up to 90% of the window; scroll=false reserves
   * that viewport for caller-owned lists. Compact fits the available frame;
   * full fills it. Body/action scroll ownership stays unchanged. */
  size?: "compact" | "form" | "full";
  scroll?: boolean;
  dismissible?: boolean;
  dirty?: boolean;
  discardTitle?: string;
  discardMessage?: string;
  returnFocusRef?: RefObject<HostInstance | TextInputInstance | null>;
}>;
