import { useLocalSearchParams } from "expo-router";
import { SessionReferenceScreen } from "../src/features/workspace/session-reference-screen";

export default function SessionReferenceRoute() {
  const { link } = useLocalSearchParams<{ link?: string | string[] }>();
  return <SessionReferenceScreen key={typeof link === "string" ? link : "invalid"} link={typeof link === "string" ? link : ""} />;
}
