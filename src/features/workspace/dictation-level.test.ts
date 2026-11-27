import { expect, it, vi } from "vitest";
import { createLevelSignal, createTextSignal, DICTATION_LIMIT_MS, dictationBars, dictationClock, dictationLimitMs, dictationRemaining, pushWaveform } from "./dictation-level";
import { PHONE_DICTATION_MS } from "./phone-dictation";
import { MAX_UTTERANCE_SAMPLES } from "../assistant/assistant-voice";

it("limits dictation to what one utterance frame holds, not a rounder number", () => {
  expect(DICTATION_LIMIT_MS).toBe(MAX_UTTERANCE_SAMPLES / 16);
  expect(dictationClock(0)).toBe("0:00");
  expect(dictationClock(12_900)).toBe("0:12");
  expect(dictationClock(DICTATION_LIMIT_MS)).toBe("0:22");
  expect(dictationClock(75_000)).toBe("1:15");
  // The clock shows the limit of the recognizer that records: the computer's frame or the phone's own.
  expect(dictationLimitMs(false)).toBe(DICTATION_LIMIT_MS);
  expect(dictationLimitMs(true)).toBe(PHONE_DICTATION_MS);
});

it("notifies the meter only when the stepped level changes", () => {
  const level = createLevelSignal(), listener = vi.fn();
  const stop = level.subscribe(listener);
  level.set(0.5);
  level.set(0.51);
  expect(level.get()).toBe(0.5);
  expect(listener).toHaveBeenCalledTimes(1);
  level.set(Number.NaN);
  expect(level.get()).toBe(0);
  level.set(4);
  expect(level.get()).toBe(1);
  stop();
  level.set(0.2);
  expect(listener).toHaveBeenCalledTimes(3);
});

it("keeps quiet bars visible and lets the middle bar lead", () => {
  expect(dictationBars(0)).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
  const loud = dictationBars(1);
  expect(Math.max(...loud)).toBe(loud[2]);
  expect(loud[2]).toBe(1);
});

it("notifies the partial preview only when the heard text changes", () => {
  const partial = createTextSignal(), listener = vi.fn();
  const stop = partial.subscribe(listener);
  expect(partial.get()).toBe("");
  partial.set("hello");
  partial.set("hello");
  partial.set("hello world");
  expect(partial.get()).toBe("hello world");
  expect(listener).toHaveBeenCalledTimes(2);
  stop();
  partial.set("");
  expect(listener).toHaveBeenCalledTimes(2);
  expect(partial.get()).toBe("");
});

it("scrolls the waveform history with a fixed bar count, starting from silence", () => {
  const first = pushWaveform([], 0.5, 4);
  expect(first).toEqual([0, 0, 0, 0.5]);
  expect(pushWaveform(first, 2, 4)).toEqual([0, 0, 0.5, 1]);
  expect(pushWaveform([0.1, 0.2, 0.3, 0.4], Number.NaN, 4)).toEqual([0.2, 0.3, 0.4, 0]);
});

it("shows the remaining seconds only near the recorder's limit", () => {
  expect(dictationRemaining(0, DICTATION_LIMIT_MS)).toBeNull();
  expect(dictationRemaining(DICTATION_LIMIT_MS - 5001, DICTATION_LIMIT_MS)).toBeNull();
  expect(dictationRemaining(DICTATION_LIMIT_MS - 5000, DICTATION_LIMIT_MS)).toBe(5);
  expect(dictationRemaining(DICTATION_LIMIT_MS - 1200, DICTATION_LIMIT_MS)).toBe(2);
  expect(dictationRemaining(DICTATION_LIMIT_MS, DICTATION_LIMIT_MS)).toBe(0);
});
