import { useState } from "react";
import { Table, type TableColumn } from "panelui-native/components/table";
import { Timeline } from "panelui-native/components/timeline";
import { Progress } from "panelui-native/components/progress";
import { Card, Row, Stack } from "./layout";
import { Heading } from "./typography";
import { Badge } from "./feedback";
import { Button } from "./buttons";
import { useCopy } from "./copy";
import { RecordCard } from "./record-card";
import { PlanSteps } from "./plan-steps";
import { FilterButton, FilterSheet } from "./filter-sheet";
import { Field } from "./fields";
import { SelectField } from "./select-field";
import { TimeField } from "./time-field";

const columns: TableColumn[] = [{ flex: 1.4 }, { flex: 1, align: "end" }];
const sampleRows = [
  { id: "chat.tsx", lines: 24 },
  { id: "theme.ts", lines: 12 },
  { id: "files.tsx", lines: 36 },
];

export function GalleryData() {
  const copy = useCopy();
  const [descending, setDescending] = useState(false);
  const [step, setStep] = useState(0);
  const [fileFilter, setFileFilter] = useState("");
  const [filterDraft, setFilterDraft] = useState<string | null>(null);
  const [time, setTime] = useState("09:00");
  const rows = sampleRows.filter((row) => !fileFilter || row.id === fileFilter).sort((left, right) =>
    descending ? right.lines - left.lines : left.lines - right.lines,
  );
  const events = [
    copy("Mesaj alındı", "Message received"),
    copy("Dosyalar incelendi", "Files inspected"),
    copy("Değişiklikler hazır", "Changes ready"),
  ];
  return (
    <Stack>
      <RecordCard title={copy("Değişiklikler hazır", "Changes ready")}
        status={<Badge label={copy("İncelemede", "In review")} tone="warning" />}
        metadata={copy("Örnek veri", "Sample data")}
        details={<SampleRecordDetails />}
        footer={<Button label={copy("Sonraki adım", "Next step")} onPress={() => setStep((value) => Math.min(value + 1, events.length - 1))} />}
      />
      <TimeField label={copy("Saat (SS:DD)", "Time (HH:MM)")} value={time} onChange={setTime} />
      <Row style={{ justifyContent: "flex-end" }}>
        <FilterButton count={fileFilter ? 1 : 0} onPress={() => setFilterDraft(fileFilter)} />
      </Row>
      {filterDraft !== null ? <FilterSheet visible onClose={() => setFilterDraft(null)}
        onReset={() => setFilterDraft("")}
        onApply={() => { setFileFilter(filterDraft); setFilterDraft(null); }}>
        <SelectField label={copy("Dosya", "File")} searchable value={filterDraft}
          options={[{ value: "", label: copy("Tümü", "All") }, ...sampleRows.map((row) => ({ value: row.id, label: row.id }))]}
          onChange={setFilterDraft} />
      </FilterSheet> : null}
      <Card>
        <Heading>{copy("Dosya değişiklikleri", "File changes")}</Heading>
        <Badge label={copy("Örnek veri", "Sample data")} />
        <Table columns={columns} size="sm">
          <Table.Header>
            <Table.Row>
              <Table.Head>{copy("Dosya", "File")}</Table.Head>
              <Table.Head
                sortable
                sortDirection={descending ? "desc" : "asc"}
                onPress={() => setDescending((value) => !value)}
                accessibilityLabel={copy("Satıra göre sırala", "Sort by lines")}
              >
                {copy("Satır", "Lines")}
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell>{row.id}</Table.Cell>
                <Table.Cell>{row.lines}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </Card>
      <Card>
        <Heading>{copy("Oturum zaman çizelgesi", "Session timeline")}</Heading>
        <Progress
          value={((step + 1) / events.length) * 100}
          label={copy("Örnek ilerleme", "Sample progress")}
          showValueLabel
        />
        <Timeline value={step}>
          {events.map((label, index) => (
            <Timeline.Item key={index} step={index} last={index === events.length - 1}>
              <Timeline.Indicator />
              <Timeline.Content>
                <Timeline.Title>{label}</Timeline.Title>
              </Timeline.Content>
            </Timeline.Item>
          ))}
        </Timeline>
        <Row>
          <Button
            label={copy("Sonraki adım", "Next step")}
            disabled={step === events.length - 1}
            onPress={() => setStep((value) => Math.min(events.length - 1, value + 1))}
          />
          <Button label={copy("Sıfırla", "Reset")} tone="quiet" onPress={() => setStep(0)} />
        </Row>
      </Card>
    </Stack>
  );
}

function SampleRecordDetails() {
  const copy = useCopy();
  const [draft, setDraft] = useState("");
  return <>
    <Field label={copy("Başlık", "Title")} value={draft} onChangeText={setDraft} />
    <PlanSteps steps={[
      { id: "inspect", title: copy("Dosyalar incelendi", "Files inspected"), status: "done" },
      { id: "review", title: copy("Değişiklikler hazır", "Changes ready"), status: "active" },
    ]} />
  </>;
}
