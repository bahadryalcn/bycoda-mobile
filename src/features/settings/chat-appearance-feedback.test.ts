import {expect,it} from "vitest";
import {ChatAppearanceStorageError} from "@/state/chat-appearance-model";
import {chatAppearanceFeedback} from "./chat-appearance-feedback";
const copy=(_tr:string,en:string)=>en;
it("does not describe a failed initial read as a changed or saved choice",()=>{
 const result=chatAppearanceFeedback(new ChatAppearanceStorageError("read"),copy)!;
 expect(result.summary).toBe("Preference unavailable");expect(result.retryable).toBe(true);
 expect(result.message).toBe("The saved text size could not be read. Retry or choose a size.");
 expect(result.message).not.toContain("changed");
});
it("identifies a locally applied but unsaved choice",()=>{
 const result=chatAppearanceFeedback(new ChatAppearanceStorageError("save"),copy)!;
 expect(result.summary).toBe("Not saved");expect(result.retryable).toBe(true);
 expect(result.message).toContain("Text size changed, but could not be saved");
});
it("does not invent a read or write operation for an unknown error",()=>{
 expect(chatAppearanceFeedback(null,copy)).toBeNull();
 const result=chatAppearanceFeedback(new Error("unknown"),copy)!;
 expect(result.retryable).toBe(false);expect(result.summary).toBe("Preference unavailable");
 expect(result.message).toBe("The text size preference is unavailable. Choose a size to retry.");
});
