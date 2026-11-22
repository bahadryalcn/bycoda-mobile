import { createElement, type ComponentType } from "react";

type LimitProps = {
  label: string;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  onChangeText?: (value: string) => void;
};

/** Editor tests drive every limit control through their own text field double. */
export function limitFieldDoubles(NumberField: ComponentType<never>) {
  const Limit = ({ label, value, error, disabled, onChange, onChangeText }: LimitProps) =>
    createElement(NumberField, { label, value, error, editable: !disabled, onChangeText: onChange ?? onChangeText } as never);
  return { LimitPresets: Limit, MinuteLimitField: Limit, IntegerTextStepper: Limit };
}
