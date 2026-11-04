import {expect,it} from "vitest";
import {matchesTranscriptNote,transcriptNoteTitle} from "./transcript-action-model";
it("bounds note titles by complete Unicode characters without changing source bodies",()=>{expect(transcriptNoteTitle("\n# "+"🙂".repeat(170),"Fallback")).toBe("🙂".repeat(160));expect(transcriptNoteTitle("  \n","Fallback")).toBe("Fallback");});
it("accepts only the requested note/body with the Host's newline normalization",()=>{expect(matchesTranscriptNote({id:"id",body:"a\nb\n"},"id","a\r\nb\r")).toBe(true);for(const value of [null,{}, {id:"other",body:"a"},{id:"id",body:"changed"}])expect(matchesTranscriptNote(value,"id","a")).toBe(false);});
