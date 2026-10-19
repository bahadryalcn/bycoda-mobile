import type { PropsWithChildren, ReactNode, RefObject, Ref } from "react";
import type {
  StyleProp,
  TextInputProps,
  TextProps,
  ViewStyle,
  View,
  TextInput,
} from "react-native";
import type { SemanticTone } from "./tokens";
import type { QueryLike } from "./query-presentation";

export type ContainerProps = PropsWithChildren<{ style?: StyleProp<ViewStyle> }>;

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
  style?: StyleProp<ViewStyle>;
}>;

export type InputProps = TextInputProps & {
  ref?: Ref<TextInput>;
  label: string;
  mono?: boolean;
  hint?: string;
  error?: string;
  tone?: "default" | SemanticTone;
};

export type ScreenProps = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  /** Trailing large-title actions, e.g. one add button or an overflow menu. */
  actions?: ReactNode;
  scroll?: boolean;
  query?: QueryLike;
  refresh?: () => unknown;
}>;

export type BodyProps = PropsWithChildren<TextProps & { muted?: boolean; mono?: boolean }>;

export type TextContentProps = PropsWithChildren<TextProps>;

export type SectionProps = PropsWithChildren<{ title: string }>;

export type ChoiceChipProps = Omit<ButtonProps, "children" | "selected"> & { selected: boolean };

export type ToggleFieldProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  detail?: string;
  tone?: "default" | SemanticTone;
};

export type PressableCardProps = ContainerProps & {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  expanded?: boolean;
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
  disabled?: boolean;
  busy?: boolean;
  density?: "regular" | "compact";
  tone?: "default" | "primary";
  expanded?: boolean;
}>;

export type BadgeProps = {
  label: string;
  tone?: "default" | SemanticTone | "live" | "active";
};

export type EmptyProps = {
  title: string;
  detail?: string;
  compact?: boolean;
  action?: { label: string; onPress: () => void };
};

export type LoadingProps = { label?: string; centered?: boolean; showLabel?: boolean };

export type ErrorTextProps = { error: unknown; message?: string };

export type ErrorNoticeProps = PropsWithChildren<{
  error: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  message?: string;
}>;

export type NoticeProps = PropsWithChildren<{
  tone?: "info" | "warning" | "success" | "danger";
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}>;

export type QueryStateProps = {
  query: QueryLike;
  empty?: boolean | string;
  emptyTitle?: string;
  emptyDetail?: string;
  emptyAction?: EmptyProps["action"];
  loading?: "list" | "content" | "inline" | "none";
};

export type MutationStateProps = {
  mutation: { isPending?: boolean; isError?: boolean; isSuccess?: boolean; error?: unknown };
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
  busy?: boolean;
  disabled?: boolean;
  tone?: ButtonProps["tone"];
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
  size?: "compact" | "form" | "full";
  scroll?: boolean;
  dismissible?: boolean;
  dirty?: boolean;
  returnFocusRef?: RefObject<View | null>;
}>;
