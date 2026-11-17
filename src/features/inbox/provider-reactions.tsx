import { useState } from "react";
import { Button, Row, SelectField, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
export const prReactionContents = ["THUMBS_UP", "THUMBS_DOWN", "LAUGH", "HOORAY", "CONFUSED", "HEART", "ROCKET", "EYES"] as const;
export function ProviderReactions({ disabled, onReaction }: { disabled?: boolean; onReaction: (mode: "add" | "remove", content: string) => void }) {
  const copy = useCopy(), [open, setOpen] = useState(false), [content, setContent] = useState<string>("THUMBS_UP");
  const labels = [copy("Beğen", "Like"), copy("Beğenme", "Dislike"), copy("Gül", "Laugh"), copy("Kutla", "Celebrate"), copy("Kafası karışmış", "Confused"), copy("Kalp", "Heart"), copy("Roket", "Rocket"), copy("Gözler", "Eyes")];
  return <>
    <Button tone="quiet" label={copy("Tepkiler", "Reactions")} disabled={disabled} onPress={() => setOpen(true)} />
    <Sheet visible={open} title={copy("Tepkiler", "Reactions")} onClose={() => setOpen(false)} size="form">
      <SelectField label={copy("Tepki", "Reaction")} value={content} options={prReactionContents.map((value, index) => ({ value, label: labels[index]! }))} onChange={setContent} />
      <Row><Button label={copy("Tepki ekle", "Add reaction")} disabled={disabled} onPress={() => { setOpen(false); onReaction("add", content); }} />
        <Button tone="quiet" label={copy("Tepkimi kaldır", "Remove my reaction")} disabled={disabled} onPress={() => { setOpen(false); onReaction("remove", content); }} /></Row>
    </Sheet>
  </>;
}
