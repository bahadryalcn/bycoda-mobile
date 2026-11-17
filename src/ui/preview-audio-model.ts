/** m:ss for a playback position in seconds; unknown or invalid values read as 0:00. */
export function formatPlaybackTime(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
