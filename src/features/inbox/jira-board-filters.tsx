import type { ReactNode } from "react";
import { SelectField } from "@/ui/primitives";
import { FilterSheet } from "@/ui/filter-sheet";
import { useCopy } from "@/ui/copy";
import type { JiraBoardSnapshot } from "./jira-board-model";

export type JiraBoardFilterValue = { scope: "board" | "backlog" | "sprint"; sprintId: string; column: string };
export const defaultJiraBoardFilters: JiraBoardFilterValue = { scope: "board", sprintId: "", column: "" };

/** Presentation only: the board owner retains staged/applied state and read authority. */
export function JiraBoardFilterSheet({ value, sprints, columns, disabled, feedback, onChange, onApply, onClose }: {
  value: JiraBoardFilterValue;
  sprints: JiraBoardSnapshot["configuration"]["sprints"];
  columns: JiraBoardSnapshot["configuration"]["columns"];
  disabled: boolean;
  feedback?: ReactNode;
  onChange: (value: JiraBoardFilterValue) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const copy = useCopy();
  return <FilterSheet visible onClose={onClose} onApply={onApply}
    applyDisabled={disabled || (value.scope === "sprint" && !value.sprintId)}
    onReset={() => onChange({ ...defaultJiraBoardFilters })}>
    <SelectField<JiraBoardFilterValue["scope"]> label={copy("Pano kapsamı", "Board scope")} value={value.scope} disabled={disabled}
      onChange={(scope) => onChange({ ...value, scope, column: "" })}
      options={[{ value: "board", label: copy("Pano", "Board") }, { value: "backlog", label: "Backlog" }, { value: "sprint", label: copy("Sprint", "Sprint") }]} />
    {value.scope === "sprint" ? <SelectField label={copy("Sprint", "Sprint")} value={value.sprintId} disabled={disabled}
      onChange={(sprintId) => onChange({ ...value, sprintId })}
      options={sprints.map((sprint) => ({ value: String(sprint.id), label: sprint.name }))} /> : null}
    <SelectField label={copy("Sütun", "Column")} value={value.column} disabled={disabled}
      onChange={(column) => onChange({ ...value, column })}
      options={[{ value: "", label: copy("Tümü", "All") }, ...columns.map((column, index) => ({ value: String(index + 1), label: column.name }))]} />
    {feedback}
  </FilterSheet>;
}
