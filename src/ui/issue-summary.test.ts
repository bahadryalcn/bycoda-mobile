import { describe, expect, it, vi } from "vitest";
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string, values?: { p0: number }) => en.replace("{p0}", String(values?.p0)) }));
vi.mock("./typography", () => ({ Body: "Body" }));
vi.mock("./feedback", () => ({ Notice: "Notice" }));
vi.mock("./buttons", () => ({ Button: "Button" }));
vi.mock("./disclosure", () => ({ Disclosure: "Disclosure" }));
vi.mock("react-native", () => ({ View: "View" }));
import { IssueSummary } from "./issue-summary";

describe("partial-result issue summary", () => {
  it("keeps every distinct failure inspectable behind one summary", () => {
    const view = IssueSummary({ issues: ["Android: offline", "iOS: unavailable", "Android: offline", null, ""] });
    const disclosure = view?.props.children;
    expect(disclosure.type).toBe("Disclosure");
    expect(disclosure.props.label).toBe("Some information is unavailable (2).");
    expect(disclosure.props.children.props.children).toBe("Android: offline\n\niOS: unavailable");
  });

  it("keeps a single failure immediately visible and renders nothing when clear", () => {
    const view = IssueSummary({ issues: ["Provider unavailable"] });
    expect(view?.type).toBe("Notice");
    expect(view?.props.message).toBe("Provider unavailable");
    expect(IssueSummary({ issues: [undefined, " "] })).toBeNull();
  });
});


it("keeps retry reachable outside collapsed details and shares retry state for a single failure", () => {
 const retry = vi.fn();
 const many = IssueSummary({ issues: ["Camera: unavailable", "Notifications: unavailable"], onRetry: retry, retrying: true });
 const action = many?.props.children.props.children[1];
 expect(action.type).toBe("Button"); expect(action.props.label).toBe("Retry"); expect(action.props.busy).toBe(true); expect(action.props.onPress).toBe(retry);
 const one = IssueSummary({ issues: ["Camera: unavailable"], onRetry: retry, retryLabel: "Read again" });
 expect(one?.props.onRetry).toBe(retry); expect(one?.props.retryLabel).toBe("Read again");
});

it("keeps structured source recovery content rather than flattening it to strings",()=>{
 const details={type:"PreciseRecovery",props:{retry:vi.fn(),manage:vi.fn()}} as any;
 expect(IssueSummary({issues:["Working folder"],details})?.props.children[0]).toBe(details);
 const multiple=IssueSummary({issues:["Projects","Working folder"],details});
 expect(multiple?.props.children.props.children).toBe(details);
});

it("retains an explicitly supplied retry alongside one structured recovery",()=>{
 const retry=vi.fn(),details={type:"SpecificRecovery",props:{}} as any;
 const result=IssueSummary({issues:["Working folder"],details,onRetry:retry,retrying:true,retryLabel:"Read again"});
 const action=result?.props.children[1];expect(action.props.onPress).toBe(retry);expect(action.props.busy).toBe(true);expect(action.props.label).toBe("Read again");
});
