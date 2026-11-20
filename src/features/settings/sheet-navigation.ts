/**
 * Settings sheets must close before a row pushes or navigates to another screen;
 * otherwise the sheet is still open when the pushed screen is dismissed.
 */
export function leaveSheetThen(close: () => void, go: () => void) {
  close();
  go();
}
