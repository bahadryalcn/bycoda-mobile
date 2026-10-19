import { Plan } from "panelui-native/components/plan";
import { useMobileTheme } from "./theme";
import { Body } from "./typography";
import { uiStyles } from "./styles";

export type PlanStep = {
  id: string;
  title: string;
  description?: string;
  metadata?: string;
  status?: "pending" | "active" | "done" | "skipped";
};

/** Readable connected steps, without a separate decorative card around every task. */
export function PlanSteps({ steps }: { steps: readonly PlanStep[] }) {
  useMobileTheme();
  return (
    <Plan className="rounded-none border-0 bg-transparent shadow-none overflow-visible">
      <Plan.Steps>
        {steps.map((step) => (
          <Plan.Step key={step.id} status={step.status ?? "pending"}
            description={step.description ? <Body muted>{step.description}</Body> : undefined}
            meta={step.metadata ? <Body muted style={uiStyles.caption}>{step.metadata}</Body> : undefined}>
            <Body style={uiStyles.title}>{step.title}</Body>
          </Plan.Step>
        ))}
      </Plan.Steps>
    </Plan>
  );
}
