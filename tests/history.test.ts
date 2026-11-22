import { describe, expect, it } from "vitest";
import {
  COALESCE_WINDOW_MS,
  MAX_HISTORY,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from "../src/core/history";

describe("history", () => {
  it("supports undo and redo and clears future on new push", () => {
    let h = createHistory(0);
    h = pushHistory(h, 1, { now: 1000 });
    h = pushHistory(h, 2, { now: 2000 });
    expect(h.present).toBe(2);

    h = undoHistory(h);
    expect(h.present).toBe(1);
    h = undoHistory(h);
    expect(h.present).toBe(0);

    h = redoHistory(h);
    expect(h.present).toBe(1);

    h = pushHistory(h, 99, { now: 3000 });
    expect(h.present).toBe(99);
    expect(h.future).toEqual([]);
  });

  it("coalesces rapid edits with the same coalesceKey within window", () => {
    let h = createHistory("a");
    h = pushHistory(h, "ab", { coalesceKey: "caption", now: 1000 });
    h = pushHistory(h, "abc", {
      coalesceKey: "caption",
      now: 1000 + COALESCE_WINDOW_MS - 100,
    });
    expect(h.past).toEqual(["a"]);
    expect(h.present).toBe("abc");

    // Different key or outside window creates a new entry
    h = pushHistory(h, "abcd", {
      coalesceKey: "caption",
      now: 1000 + COALESCE_WINDOW_MS * 3,
    });
    expect(h.past).toEqual(["a", "abc"]);
  });

  it("caps past history length to MAX_HISTORY", () => {
    let h = createHistory(0);
    for (let i = 1; i <= MAX_HISTORY + 25; i += 1) {
      h = pushHistory(h, i, { now: i * 1000 });
    }
    expect(h.past.length).toBe(MAX_HISTORY);
    expect(h.present).toBe(MAX_HISTORY + 25);
  });
});
