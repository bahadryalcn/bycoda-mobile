import { Redirect, type Href } from "expo-router";

/** Old address of the account notification settings; they now live on Settings → Notifications. */
export default function AccountNotificationsRoute() {
  return <Redirect href={"/settings/notifications" as Href} />;
}
