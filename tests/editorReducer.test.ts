import { describe, expect, it } from "vitest";
import { isBBoxValid } from "../src/core/coordinates";
import {
  STORAGE_KEY,
  type StorageLike,
  createDefaultDocument,
  createInitialAppState,
  editorReducer,
  loadDocumentFromStorage,
  saveDocumentToStorage,
  shouldIgnoreGlobalShortcut,
} from "../src/state/useEditorStore";

describe("editorReducer", () => {
  it("auto-collapses right panel when selection is cleared or deleted, and opens on gear click", () => {
    const doc = createDefaultDocument();
    let state = createInitialAppState(doc);
    const firstId = doc.items[0].id;

    state = editorReducer(state, { type: "SELECT_ITEM", id: null });
    expect(state.selectedId).toBeNull();
    expect(state.rightOpen).toBe(false);

    // Selecting normally keeps right panel closed
    state = editorReducer(state, { type: "SELECT_ITEM", id: firstId });
    expect(state.selectedId).toBe(firstId);
    expect(state.rightOpen).toBe(false);

    // Gear click forces right panel open
    state = editorReducer(state, {
      type: "SELECT_ITEM",
      id: firstId,
      forceOpenRight: true,
    });
    expect(state.rightOpen).toBe(true);

    // Deleting selected item clears selection and collapses right panel
    state = editorReducer(state, { type: "DELETE_ITEM", id: firstId });
    expect(state.selectedId).toBeNull();
    expect(state.rightOpen).toBe(false);
  });

  it("reconciles selection safely after Undo removes newly added item", () => {
    const doc = createDefaultDocument();
    let state = createInitialAppState(doc);
    state = editorReducer(state, { type: "ADD_ITEM", label: "text" });
    const addedId = state.selectedId;
    expect(addedId).not.toBeNull();
    state = editorReducer(state, {
      type: "SELECT_ITEM",
      id: addedId,
      forceOpenRight: true,
    });
    expect(state.rightOpen).toBe(true);

    // Undo removes added item -> selection becomes null and right panel closes
    state = editorReducer(state, { type: "UNDO" });
    expect(state.selectedId).toBeNull();
    expect(state.rightOpen).toBe(false);
  });

  it("reorders items forward/backward without mutating bbox", () => {
    const doc = createDefaultDocument();
    let state = createInitialAppState(doc);
    const idsBefore = state.history.present.items.map((i) => i.id);

    state = editorReducer(state, {
      type: "REORDER_ITEM",
      id: idsBefore[0],
      direction: "forward",
    });
    expect(state.history.present.items.map((i) => i.id)).toEqual([
      idsBefore[1],
      idsBefore[0],
      idsBefore[2],
    ]);

    state = editorReducer(state, {
      type: "REORDER_ITEM",
      id: idsBefore[0],
      direction: "backward",
    });
    expect(state.history.present.items.map((i) => i.id)).toEqual(idsBefore);
  });

  it("does not rescale items when canvas size changes", () => {
    const doc = createDefaultDocument();
    const origBBoxes = doc.items.map((i) => [...i.bbox]);
    let state = createInitialAppState(doc);

    state = editorReducer(state, {
      type: "SET_CANVAS_SIZE",
      width: 512,
      height: 512,
    });
    expect(state.history.present.width).toBe(512);
    expect(state.history.present.items.map((i) => i.bbox)).toEqual(origBBoxes);
  });

  it("does not push Undo history when UPDATE_SUMMARY or UPDATE_ITEM has identical values", () => {
    const doc = createDefaultDocument();
    const initial = createInitialAppState(doc);
    const target = doc.items[1];

    // No-op summary updates (new array references with same contents)
    let next = editorReducer(initial, {
      type: "UPDATE_SUMMARY",
      patch: {
        caption: doc.summary.caption,
        meta: [...doc.summary.meta],
        palette: [...doc.summary.palette],
      },
    });
    expect(next).toBe(initial);
    expect(next.history.past.length).toBe(0);

    // No-op item updates (new bbox & tags array with same contents)
    next = editorReducer(next, {
      type: "UPDATE_ITEM",
      id: target.id,
      patch: {
        bbox: [...target.bbox],
        tags: [...target.tags],
        palette: [...target.palette],
      },
    });
    expect(next).toBe(initial);
    expect(next.history.past.length).toBe(0);

    // Actual change pushes history and can be undone/redone
    const updated = editorReducer(next, {
      type: "UPDATE_ITEM",
      id: target.id,
      patch: { tags: [...target.tags, "jacket"] },
    });
    expect(updated.history.past.length).toBe(1);
    const undone = editorReducer(updated, { type: "UNDO" });
    expect(undone.history.present.items[1].tags).toEqual(target.tags);
    const redone = editorReducer(undone, { type: "REDO" });
    expect(redone.history.present.items[1].tags).toEqual([
      ...target.tags,
      "jacket",
    ]);
  });

  it("adds valid items on 16x16, 16x32, and 32x16 canvases", () => {
    const sizes: Array<[number, number]> = [
      [16, 16],
      [16, 32],
      [32, 16],
    ];
    for (const [width, height] of sizes) {
      let state = createInitialAppState({
        ...createDefaultDocument(),
        width,
        height,
        items: [],
      });
      for (const label of ["object", "character", "text"] as const) {
        state = editorReducer(state, { type: "ADD_ITEM", label });
        const added =
          state.history.present.items[state.history.present.items.length - 1];
        expect(isBBoxValid(added.bbox, width, height)).toBe(true);
      }
    }
  });
});

describe("shortcut guard and storage resilience", () => {
  it("ignores global shortcuts inside inputs, modals, or IME composition", () => {
    expect(
      shouldIgnoreGlobalShortcut({ tagName: "INPUT" }, false, false),
    ).toBe(true);
    expect(
      shouldIgnoreGlobalShortcut({ tagName: "TEXTAREA" }, false, false),
    ).toBe(true);
    expect(
      shouldIgnoreGlobalShortcut({ tagName: "DIV" }, true, false),
    ).toBe(true);
    expect(
      shouldIgnoreGlobalShortcut({ tagName: "DIV" }, false, true),
    ).toBe(true);
    expect(
      shouldIgnoreGlobalShortcut({ tagName: "DIV" }, false, false),
    ).toBe(false);
  });

  it("recovers safely from corrupted localStorage or quota exceptions", () => {
    const map = new Map<string, string>();
    map.set(STORAGE_KEY, "{broken json");
    const mockStorage: StorageLike = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        map.set(k, v);
      },
      removeItem: (k) => {
        map.delete(k);
      },
    };
    const recovered = loadDocumentFromStorage(mockStorage);
    expect(recovered.width).toBe(1280);
    expect(map.has(STORAGE_KEY)).toBe(false);

    const throwingStorage: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(saveDocumentToStorage(throwingStorage, recovered)).toBe(false);
    expect(loadDocumentFromStorage(throwingStorage).width).toBe(1280);
  });
});
