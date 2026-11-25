import { Stack } from "expo-router";
import { ScreenList, type ScreenListProps } from "@/ui/screen-list";
import { useScreenChrome } from "@/ui/screen-chrome";

/**
 * A management list page. Its commands (New, Edit) trail the page's scope row (project pill) like
 * every other page's icon actions. Only a page with no scope row under a native title moves them to
 * the navigation bar, so a row never exists just to hold one icon.
 */
export function ManagementList<T>({ actions, header, computerSwitch = true, ...props }: ScreenListProps<T>) {
  const { nativeTitle } = useScreenChrome();
  // Management pages read the active computer: their scope row leads with its switchable pill.
  const scopeRow = computerSwitch || !!(props.scopeControl || props.scope?.computer || props.scope?.project || props.context);
  const toNavigationBar = nativeTitle && !scopeRow;
  const native = toNavigationBar && actions ? <Stack.Screen options={{ headerRight: () => actions }} /> : null;
  return (
    <ScreenList<T>
      {...props}
      computerSwitch={computerSwitch}
      actions={toNavigationBar ? undefined : actions}
      header={
        <>
          {native}
          {header}
        </>
      }
    />
  );
}
