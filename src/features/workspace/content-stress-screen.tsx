import { View } from "react-native";
import { Body } from "@/ui/primitives";
import { MessageCode } from "@/ui/message-code";
import { ScreenList } from "@/ui/screen-list";
import { space } from "@/ui/tokens";
import { ActivityApproval } from "./activity-inspector-approval";
import { QuestionCard } from "./question-card";
import { SessionActivityBar } from "./session-activity-bar";
import { deriveSessionActivity } from "./session-activity-model";
import { TranscriptStructured } from "./transcript-structured";
import { contentStressApprovals, contentStressCode, contentStressDiff, contentStressPlan, contentStressQuestions, contentStressShell } from "./content-stress-fixtures";
import type { ReactNode } from "react";

const refuseCommand = async () => { throw new Error("Developer fixture cannot send Host commands"); };
const scope = { machineId: "fixture-machine", sessionId: "fixture-session" };
const rows = ["working", "plan", "diff", "code", "shell", "questions", "approvals"] as const;

/** Real content controls with synthetic data, no Host connection or command authority. */
export function ContentStressScreen({ header }: { header: ReactNode }) {
  return <ScreenList title="Chat fixtures" header={header} data={rows} keyExtractor={item => item}
    renderItem={({ item }) => <View style={{ gap: space.sm, paddingVertical: space.sm }}>
      {item === "working" ? <SessionActivityBar activity={deriveSessionActivity({ blocks: [contentStressShell], live: true })} browser={{ host: "localhost:5173" }} onDevice={() => {}} onBrowser={() => {}} /> : null}
      {item === "code" ? <MessageCode code={contentStressCode} language="typescript" compact allowPreview={false} /> : null}
      {item === "plan" ? <TranscriptStructured block={contentStressPlan} /> : null}
      {item === "diff" ? <TranscriptStructured block={contentStressDiff} /> : null}
      {item === "shell" ? <TranscriptStructured block={contentStressShell} /> : null}
      {item === "questions" ? contentStressQuestions.map(question => <QuestionCard key={question.requestId}
        question={question} disabled={false} onAnswer={refuseCommand} />) : null}
      {item === "approvals" ? contentStressApprovals.map(block => <View key={block.id} style={{ gap: space.sm }}>
        <Body>{block.text}</Body>
        <ActivityApproval approval={block.approval!} scope={scope} runId="fixture-run" disabled onCommand={refuseCommand} />
      </View>) : null}
    </View>} />;
}
