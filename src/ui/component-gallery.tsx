import { useState } from "react";
import { View } from "react-native";
import Check from "lucide-react-native/icons/check";
import { Body, Heading } from "./typography";
import { Button } from "./buttons";
import { Card, Row, Stack } from "./layout";
import { Field, ToggleField } from "./fields";
import { Badge, Notice, Loading, Skeleton } from "./feedback";
import { Sheet } from "./dialogs";
import { SegmentedControl } from "./segmented-control";
import { Disclosure } from "./disclosure";
import { componentCatalog } from "./catalog";
import { Checkbox, CheckboxIndicator, CheckboxIcon, CheckboxLabel } from "./gluestack/checkbox";
import { Radio, RadioGroup, RadioIndicator, RadioIcon, RadioLabel } from "./gluestack/radio";
import { Slider, SliderTrack, SliderFilledTrack, SliderThumb } from "./gluestack/slider";
import { Progress, ProgressFilledTrack } from "./gluestack/progress";
import { Avatar, AvatarFallbackText } from "./gluestack/avatar";
import {
  MessageBranch,
  MessageBranchContent,
  MessageBranchSelector,
  MessageBranchPrevious,
  MessageBranchNext,
  MessageBranchPage,
} from "./gluestack/chat-ai/message";
import { ChatMessage, ChatMessageContent, ChatResponse, ChatComposerSurface } from "./chat";
import {
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "./gluestack/chat-ai/prompt-input";
import { colors, space } from "./tokens";
import Circle from "lucide-react-native/icons/circle";
import { Attachments, Attachment } from "./gluestack/chat-ai/attatchments";
import { Modal, ModalBackdrop, ModalContent, ModalHeader, ModalBody } from "./gluestack/modal";
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetItem,
  ActionsheetItemText,
} from "./gluestack/actionsheet";

/** Synthetic developer gallery. Contains no host, account or session data. */
export function ComponentGallery() {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState(false);
  const [choice, setChoice] = useState("compact");
  const [range, setRange] = useState(40);
  const [sheet, setSheet] = useState(false);
  const [modal, setModal] = useState(false);
  const [actionsheet, setActionsheet] = useState(false);
  const [sent, setSent] = useState("");
  const [prompt, setPrompt] = useState("");
  const demo = {
    id: "gallery-response",
    role: "assistant" as const,
    parts: [{ type: "text" as const, text: "Changes complete. Tap a file link to inspect it." }],
  };
  return (
    <Stack>
      <Heading>{"Component library"}</Heading>
      <Body muted>{"One theme, consistent controls and behavior."}</Body>
      <Card>
        <Heading>{"Core controls"}</Heading>
        <Field
          label={"Title"}
          value={text}
          onChangeText={setText}
          placeholder={"Enter a title"}
          hint={"Help remains visible."}
        />
        <Field label={"Invalid field"} value="" error={"This field is required."} />
        <Row>
          <Button label={"Primary"} tone="primary" onPress={() => setSheet(true)} />
          <Button label={"Secondary"} tone="secondary" onPress={() => setSheet(true)} />
          <Button label={"Quiet"} tone="quiet" onPress={() => setSheet(true)} />
        </Row>
        <Row>
          <Button label={"Working"} busy onPress={() => {}} />
          <Button label={"Disabled"} disabled onPress={() => {}} />
          <Button label={"Delete"} tone="danger" onPress={() => setSheet(true)} />
        </Row>
      </Card>
      <Card>
        <Heading>{"Selection and settings"}</Heading>
        <ToggleField label={"Notifications"} value={checked} onChange={setChecked} />
        <Checkbox
          value="gallery"
          isChecked={checked}
          onChange={setChecked}
          accessibilityLabel={"Selected"}
          className="min-h-touch gap-ui-sm"
        >
          <CheckboxIndicator>
            <CheckboxIcon as={Check} />
          </CheckboxIndicator>
          <CheckboxLabel>{"Selected"}</CheckboxLabel>
        </Checkbox>
        <RadioGroup value={choice} onChange={setChoice} className="gap-ui-xs">
          <Radio value="compact" className="min-h-touch gap-ui-sm">
            <RadioIndicator>
              <RadioIcon as={Circle} />
            </RadioIndicator>
            <RadioLabel>{"Compact"}</RadioLabel>
          </Radio>
          <Radio value="comfortable" className="min-h-touch gap-ui-sm">
            <RadioIndicator>
              <RadioIcon as={Circle} />
            </RadioIndicator>
            <RadioLabel>{"Comfortable"}</RadioLabel>
          </Radio>
        </RadioGroup>
        <SegmentedControl
          label={"Density"}
          value={choice}
          onChange={setChoice}
          options={[
            { value: "compact", label: "Compact" },
            { value: "comfortable", label: "Comfortable" },
          ]}
        />
        <Slider
          value={range}
          onChange={setRange}
          minValue={0}
          maxValue={100}
          accessibilityLabel={"Progress"}
          className="min-h-touch"
        >
          <SliderTrack>
            <SliderFilledTrack />
          </SliderTrack>
          <SliderThumb />
        </Slider>
        <Body muted>{range}%</Body>
      </Card>
      <Card>
        <Heading>{"States"}</Heading>
        <Row>
          <Avatar className="size-8">
            <AvatarFallbackText>bycoda</AvatarFallbackText>
          </Avatar>
          <Badge label={"Ready"} />
          <Badge label={"Running"} tone="live" />
          <Badge label={"Failed"} tone="danger" />
        </Row>
        <Progress value={range} accessibilityLabel={"Progress"}>
          <ProgressFilledTrack />
        </Progress>
        <Notice tone="success" message={"Changes saved."} />
        <Notice tone="warning" message={"Approval is required."} />
        <Notice tone="danger" message={"Connection failed."} onRetry={() => setSheet(true)} />
        <Loading label={"Loading…"} />
        <Skeleton variant="content" />
        <Disclosure label={"Details"}>
          <Body>{"Content opens in one step."}</Body>
        </Disclosure>
      </Card>
      <Card>
        <Heading>Overlays</Heading>
        <Row>
          <Button label="Open dialog" onPress={() => setModal(true)} />
          <Button label="Open actions" onPress={() => setActionsheet(true)} />
        </Row>
      </Card>
      <Card>
        <Heading>ChatAI</Heading>
        <Attachments>
          <Attachment
            data={{
              id: "gallery-file",
              type: "file",
              filename: "example.png",
              mediaType: "image/png",
              url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZpAAAAABJRU5ErkJggg==",
            }}
          />
        </Attachments>
        <ChatMessage role="user">
          <ChatMessageContent>
            <Body>{"Simplify the conversation."}</Body>
          </ChatMessageContent>
        </ChatMessage>
        <MessageBranch>
          <MessageBranchContent>
            <ChatMessage role="assistant" message={demo}>
              <ChatResponse message={demo} />
            </ChatMessage>
            <ChatMessage role="assistant">
              <Body>{"Files open on tap."}</Body>
            </ChatMessage>
          </MessageBranchContent>
          <MessageBranchSelector>
            <MessageBranchPrevious />
            <MessageBranchPage />
            <MessageBranchNext />
          </MessageBranchSelector>
        </MessageBranch>
        <ChatComposerSurface
          value={prompt}
          onChangeText={setPrompt}
          onSubmit={({ text }) => {
            setSent(text);
            setPrompt("");
          }}
          style={{
            backgroundColor: colors.panel,
            borderColor: colors.border,
            borderWidth: 1,
            padding: space.sm,
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea label={"Message"} placeholder={"Write a message"} />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputSubmit label={"Send"} />
          </PromptInputFooter>
        </ChatComposerSurface>
        {sent ? <Body accessibilityLiveRegion="polite">{sent}</Body> : null}
      </Card>
      <Card>
        <Heading>
          {"Catalog"} · {componentCatalog.length}
        </Heading>
        <Field label={"Search components"} value={search} onChangeText={setSearch} />
        {componentCatalog
          .filter((item) => item.id.includes(search.toLowerCase()))
          .map((item) => (
            <Row key={item.id}>
              <Body style={{ flex: 1 }}>{item.id}</Body>
              <Badge label={item.group} />
            </Row>
          ))}
      </Card>
      <Sheet visible={sheet} title={"Details"} onClose={() => setSheet(false)}>
        <Body>{"Shared panel with back, focus and lock behavior."}</Body>
        <Button label={"Close"} onPress={() => setSheet(false)} />
      </Sheet>
      <Modal isOpen={modal} onClose={() => setModal(false)}>
        <ModalBackdrop />
        <ModalContent>
          <ModalHeader>
            <Heading>Shared dialog</Heading>
          </ModalHeader>
          <ModalBody>
            <Body>Content remains readable on a narrow screen.</Body>
            <Button label="Close dialog" onPress={() => setModal(false)} />
          </ModalBody>
        </ModalContent>
      </Modal>
      <Actionsheet isOpen={actionsheet} onClose={() => setActionsheet(false)}>
        <ActionsheetBackdrop />
        <ActionsheetContent>
          <ActionsheetItem onPress={() => setActionsheet(false)}>
            <ActionsheetItemText>Close actions</ActionsheetItemText>
          </ActionsheetItem>
        </ActionsheetContent>
      </Actionsheet>
    </Stack>
  );
}
