import { Stack } from "expo-router";
import { ScreenList, type ScreenListProps } from "@/ui/screen-list";
import { useScreenChrome } from "@/ui/screen-chrome";

/**
 * A management list page. Page commands (New, Edit) belong in the native navigation bar like every
 * other tool page; only a page without a native title keeps them in its heading row, so the row
 * never exists just to hold one icon.
 */
export function ManagementList<T>({ actions, header, ...props }: ScreenListProps<T>) {
  const { nativeTitle } = useScreenChrome();
  const native = nativeTitle && actions ? <Stack.Screen options={{ headerRight: () => actions }} /> : null;
  return (
    <ScreenList<T>
      {...props}
      actions={nativeTitle ? undefined : actions}
      header={
        <>
          {native}
          {header}
        </>
      }
    />
  );
}
