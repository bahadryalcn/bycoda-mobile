import type { PageScope } from "./scope-line";
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
  ref?: Ref<HostInstance>;
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  selected?: boolean;
  tone?: "default" | "primary" | "secondary" | "quiet" | SemanticTone;
  density?: "regular" | "compact";
  fullWidth?: boolean;
  /** Reserve a full touch target in layout for a button beside other controls. */
  reserveTouchTarget?: boolean;
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
  /** Which computer/project the page acts on: read-only scope pills at the start of the scope row. */
  scope?: PageScope;
  /**
   * The page reads the active computer, so its scope row leads with the switchable computer pill
   * (status, saved computers). Defaults to true when the page passes its own `scopeControl`.
   * A page bound to one computer leaves it off and shows `scope.computer` read-only.
   */
  computerSwitch?: boolean;
  /** Current task scope in the shared heading, preserved under a native title. */
  context?: ReactNode;
  /** The shared project scope control (`ProjectScopePill`): one compact pill in the page identity row. */
  scopeControl?: ReactNode;
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
  /**
   * `compact` draws a 28 visual reaching 48 through hitSlop. Only for a button standing alone: in a
   * row of icon actions the slop areas overlap, so siblings use `reserveTouchTarget` instead.
   */
  density?: "regular" | "compact";
  /** Reserve the full layout target when a parent can clip expanded hit areas, or icon actions sit side by side. */
  reserveTouchTarget?: boolean;
  tone?: "default" | "primary" | "danger";
  expanded?: boolean;
}>;

export type BadgeProps = { label: string; tone?: "default" | SemanticTone | "live" | "active"; /** Optional leading glyph (a lucide icon component), drawn 12dp in the badge ink; decorative, the label carries the meaning. */ icon?: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>; };

/** Button-shaped recovery or next step shown by a state. */
export type StateAction = { label: string; onPress: () => void; busy?: boolean; reserveTouchTarget?: boolean };

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
  /** Inline, left-aligned variant (icon row) for small sub-sections. Same as `size="compact"`. */
  compact?: boolean;
  /**
   * `line`: one status line (24 pt). `compact`: icon row for a section (96 pt, 128 pt with an action).
   * `region`: centered state that owns a whole screen, list or sheet body. Wins over `compact`.
   */
  size?: StateSize;
  tone?: StateTone;
  testID?: string;
};

export type StateSize = "line" | "compact" | "region";

/** One line of status: icon + text + optional text action, no fill, about 24 pt. */
export type StatusLineProps = {
  tone?: "neutral" | "info" | "warning" | "danger" | "success";
  label: string;
  /** Replaces the icon with a small spinner while the described work runs. */
  busy?: boolean;
  action?: { label: string; onPress: () => void };
  /** Overrides the tone ink on a fixed-color surface such as the media viewer. */
  color?: string;
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

export type LoadingProps = {
  label?: string;
  centered?: boolean;
  showLabel?: boolean;
  immediate?: boolean;
  /** Wait the shared reveal delay before drawing; a read's progress uses it so fast reads never flash. Defaults to `centered && !immediate`. */
  delayed?: boolean;
};

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
  /** Uses inline feedback when the query owns a section of a form or sheet. Same as `size="compact"`. */
  compact?: boolean;
  /**
   * Failure, waiting and empty presentation size. By default the first failing query of a Screen or
   * Sheet reports the failure (`region` when it draws a list/content placeholder or centered spinner,
   * `compact` for inline/none loading) and later failing sections show one `line`.
   * Pass `region` when this query owns the whole screen body, `compact` for a section.
   */
  size?: StateSize;
  /** Overrides the default nearest-Sheet guarded close and connection navigation. */
  onManageConnections?: () => void;
  /** Joins a route-wide connection notice for reads from the same computer. */
  shareConnectionFeedback?: boolean;
  empty?: boolean | string;
  emptyTitle?: string;
  emptyDetail?: string;
  emptyAction?: EmptyProps["action"];
  /** Illustration for the empty state; defaults to "search-empty" when `searching`. */
  emptyIllustration?: IllustrationName;
  /** A search or filter is active, so empty means "no matches". */
  searching?: boolean;
  /**
   * The shared no-results state for a searched or filtered collection. When its `searching` or
   * `filtered` is true, an empty result renders `NoResults` instead of the ordinary empty state.
   */
  noResults?: import("./no-results").NoResultsProps;
  /** The device itself has no network; selects the offline illustration for errors. */
  offline?: boolean;
  /** "list"/"content" draw a skeleton of that shape; "centered" a spinner in the region. */
  loading?: "list" | "content" | "inline" | "centered" | "none";
  loadingLabel?: string;
  /** Replaces the spinner in inline or centered mode while keeping recovery feedback. */
  renderLoading?: (label: string) => ReactNode;
};

export type MutationStateProps = {
  mutation: { isPending?: boolean; isError?: boolean; isSuccess?: boolean; error?: unknown; submittedAt?: number };
  pending?: string;
  success?: string;
};

export type FormActionsProps = {
  /** Keep actions in a collapsible subsection instead of the parent sheet's footer. */
  placement?: "inline";
  /** Operation feedback stays beside actions; field errors remain in the form. */
  feedback?: ReactNode;
  submitLabel: string;
  /** Focus target for a review opened from this submit action. */
  submitRef?: Ref<HostInstance>;
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
  /** A new non-null value re-enables dismissal after an async close fails without hiding the sheet. */
  dismissalRetryKey?: unknown;
  discardTitle?: string;
  discardMessage?: string;
  returnFocusRef?: RefObject<HostInstance | TextInputInstance | null>;
}>;
