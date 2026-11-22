import { useCallback, useEffect, useReducer } from "react";
import {
  createDefaultBBox,
  snapDimension,
  translateBBox,
} from "../core/coordinates";
import {
  type HistoryState,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from "../core/history";
import {
  createItemId,
  parseImportJson,
  serializeProjectFile,
} from "../core/serializer";
import type {
  BBoxYxyx,
  DocumentState,
  EditorItem,
  EditorSummary,
  ItemLabel,
} from "../core/types";

export const STORAGE_KEY = "nz-moss-prompter/v1";

export interface EditorAppState {
  history: HistoryState<DocumentState>;
  selectedId: string | null;
  activeView: "canvas" | "json";
  leftOpen: boolean;
  rightOpen: boolean;
  copyCompact: boolean;
}

export type EditorAction =
  | { type: "SET_CANVAS_SIZE"; width: number; height: number }
  | {
      type: "UPDATE_SUMMARY";
      patch: Partial<EditorSummary>;
      coalesceKey?: string;
    }
  | { type: "ADD_ITEM"; label?: ItemLabel }
  | { type: "DUPLICATE_ITEM"; id: string }
  | { type: "DELETE_ITEM"; id: string }
  | {
      type: "UPDATE_ITEM";
      id: string;
      patch: Partial<Omit<EditorItem, "id">>;
      coalesceKey?: string;
    }
  | { type: "REORDER_ITEM"; id: string; direction: "forward" | "backward" }
  | { type: "SELECT_ITEM"; id: string | null; forceOpenRight?: boolean }
  | { type: "SET_LEFT_OPEN"; open: boolean }
  | { type: "SET_RIGHT_OPEN"; open: boolean }
  | { type: "SET_VIEW"; view: "canvas" | "json" }
  | { type: "SET_COPY_COMPACT"; compact: boolean }
  | { type: "IMPORT_DOCUMENT"; document: DocumentState }
  | { type: "UNDO" }
  | { type: "REDO" };

export function createDefaultDocument(): DocumentState {
  return {
    width: 1280,
    height: 768,
    summary: {
      caption: "A bright illustration of a woman beside a wooden bench.",
      meta: ["illustration"],
      canvas: "single",
      palette: ["blue", "white"],
    },
    items: [
      {
        id: createItemId(),
        label: "text",
        caption: "Large blue headline.",
        text: "HELLO WORLD",
        tags: [],
        palette: [],
        bbox: [-334, -315, -205, 315],
      },
      {
        id: createItemId(),
        label: "character",
        caption: "A young woman in a red jacket.",
        text: "",
        tags: ["woman"],
        palette: ["red"],
        bbox: [-108, -575, 315, -55],
      },
      {
        id: createItemId(),
        label: "object",
        caption: "A wooden bench.",
        text: "",
        tags: ["furniture"],
        palette: ["brown"],
        bbox: [-35, 47, 290, 550],
      },
    ],
  };
}

export function createInitialAppState(doc: DocumentState): EditorAppState {
  const initialSelected = doc.items.length > 0 ? doc.items[doc.items.length - 1].id : null;
  return {
    history: createHistory(doc),
    selectedId: initialSelected,
    activeView: "canvas",
    leftOpen: true,
    rightOpen: initialSelected !== null,
    copyCompact: true,
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadDocumentFromStorage(
  storage: StorageLike | null | undefined,
): DocumentState {
  if (!storage) return createDefaultDocument();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultDocument();
    const res = parseImportJson(raw, 1280, 768);
    return res.document;
  } catch {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage access errors in restricted environments
    }
    return createDefaultDocument();
  }
}

export function saveDocumentToStorage(
  storage: StorageLike | null | undefined,
  doc: DocumentState,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, serializeProjectFile(doc));
    return true;
  } catch {
    return false;
  }
}

export function shouldIgnoreGlobalShortcut(
  target: { tagName?: string; isContentEditable?: boolean } | null,
  isModalOpen: boolean,
  isComposing: boolean,
): boolean {
  if (isModalOpen || isComposing) return true;
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function reconcileSelection(
  doc: DocumentState,
  selectedId: string | null,
  rightOpen: boolean,
): { selectedId: string | null; rightOpen: boolean } {
  if (selectedId === null) {
    return { selectedId: null, rightOpen: false };
  }
  const exists = doc.items.some((item) => item.id === selectedId);
  if (!exists) {
    return { selectedId: null, rightOpen: false };
  }
  return { selectedId, rightOpen };
}

export function editorReducer(
  state: EditorAppState,
  action: EditorAction,
): EditorAppState {
  const doc = state.history.present;

  switch (action.type) {
    case "SET_CANVAS_SIZE": {
      const width = snapDimension(action.width);
      const height = snapDimension(action.height);
      if (width === doc.width && height === doc.height) return state;
      const nextDoc: DocumentState = { ...doc, width, height };
      return {
        ...state,
        history: pushHistory(state.history, nextDoc),
      };
    }

    case "UPDATE_SUMMARY": {
      const nextDoc: DocumentState = {
        ...doc,
        summary: { ...doc.summary, ...action.patch },
      };
      return {
        ...state,
        history: pushHistory(state.history, nextDoc, {
          coalesceKey: action.coalesceKey,
        }),
      };
    }

    case "ADD_ITEM": {
      const label: ItemLabel = action.label ?? "object";
      const newItem: EditorItem = {
        id: createItemId(),
        label,
        caption:
          label === "text"
            ? "New text element."
            : label === "character"
              ? "New character."
              : "New object.",
        text: label === "text" ? "TEXT" : "",
        tags: [],
        palette: [],
        bbox: createDefaultBBox(doc.width, doc.height, doc.items.length),
      };
      const nextDoc: DocumentState = {
        ...doc,
        items: [...doc.items, newItem],
      };
      return {
        ...state,
        history: pushHistory(state.history, nextDoc),
        selectedId: newItem.id,
      };
    }

    case "DUPLICATE_ITEM": {
      const source = doc.items.find((item) => item.id === action.id);
      if (!source) return state;
      const shiftedBBox: BBoxYxyx = translateBBox(
        source.bbox,
        24,
        24,
        doc.width,
        doc.height,
      );
      const copy: EditorItem = {
        ...source,
        id: createItemId(),
        tags: [...source.tags],
        palette: [...source.palette],
        bbox: shiftedBBox,
      };
      const nextDoc: DocumentState = {
        ...doc,
        items: [...doc.items, copy],
      };
      return {
        ...state,
        history: pushHistory(state.history, nextDoc),
        selectedId: copy.id,
      };
    }

    case "DELETE_ITEM": {
      const nextItems = doc.items.filter((item) => item.id !== action.id);
      if (nextItems.length === doc.items.length) return state;
      const nextDoc: DocumentState = { ...doc, items: nextItems };
      const nextSel = reconcileSelection(
        nextDoc,
        state.selectedId === action.id ? null : state.selectedId,
        state.rightOpen,
      );
      return {
        ...state,
        history: pushHistory(state.history, nextDoc),
        selectedId: nextSel.selectedId,
        rightOpen: nextSel.rightOpen,
      };
    }

    case "UPDATE_ITEM": {
      let changed = false;
      const nextItems = doc.items.map((item) => {
        if (item.id !== action.id) return item;
        changed = true;
        return { ...item, ...action.patch };
      });
      if (!changed) return state;
      const nextDoc: DocumentState = { ...doc, items: nextItems };
      return {
        ...state,
        history: pushHistory(state.history, nextDoc, {
          coalesceKey: action.coalesceKey,
        }),
      };
    }

    case "REORDER_ITEM": {
      const idx = doc.items.findIndex((item) => item.id === action.id);
      if (idx === -1) return state;
      const targetIdx =
        action.direction === "forward" ? idx + 1 : idx - 1;
      if (targetIdx < 0 || targetIdx >= doc.items.length) return state;
      const nextItems = [...doc.items];
      const [moved] = nextItems.splice(idx, 1);
      nextItems.splice(targetIdx, 0, moved);
      const nextDoc: DocumentState = { ...doc, items: nextItems };
      return {
        ...state,
        history: pushHistory(state.history, nextDoc),
      };
    }

    case "SELECT_ITEM": {
      if (action.id === null) {
        return { ...state, selectedId: null, rightOpen: false };
      }
      const exists = doc.items.some((item) => item.id === action.id);
      if (!exists) {
        return { ...state, selectedId: null, rightOpen: false };
      }
      return {
        ...state,
        selectedId: action.id,
        rightOpen: action.forceOpenRight ? true : state.rightOpen,
      };
    }

    case "SET_LEFT_OPEN":
      return { ...state, leftOpen: action.open };

    case "SET_RIGHT_OPEN":
      return {
        ...state,
        rightOpen: state.selectedId === null ? false : action.open,
      };

    case "SET_VIEW":
      return { ...state, activeView: action.view };

    case "SET_COPY_COMPACT":
      return { ...state, copyCompact: action.compact };

    case "IMPORT_DOCUMENT": {
      const nextDoc = action.document;
      const nextSelected =
        nextDoc.items.length > 0 ? nextDoc.items[0].id : null;
      return {
        ...state,
        history: pushHistory(state.history, nextDoc),
        selectedId: nextSelected,
        rightOpen: nextSelected !== null ? state.rightOpen : false,
      };
    }

    case "UNDO": {
      const nextHistory = undoHistory(state.history);
      if (nextHistory === state.history) return state;
      const nextSel = reconcileSelection(
        nextHistory.present,
        state.selectedId,
        state.rightOpen,
      );
      return {
        ...state,
        history: nextHistory,
        selectedId: nextSel.selectedId,
        rightOpen: nextSel.rightOpen,
      };
    }

    case "REDO": {
      const nextHistory = redoHistory(state.history);
      if (nextHistory === state.history) return state;
      const nextSel = reconcileSelection(
        nextHistory.present,
        state.selectedId,
        state.rightOpen,
      );
      return {
        ...state,
        history: nextHistory,
        selectedId: nextSel.selectedId,
        rightOpen: nextSel.rightOpen,
      };
    }

    default:
      return state;
  }
}

export function useEditorStore() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => {
    const storage =
      typeof window !== "undefined" ? window.localStorage : undefined;
    return createInitialAppState(loadDocumentFromStorage(storage));
  });

  const doc = state.history.present;

  // Debounced auto-save to localStorage + flush on pagehide
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      saveDocumentToStorage(window.localStorage, doc);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [doc]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPageHide = () => {
      saveDocumentToStorage(window.localStorage, doc);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [doc]);

  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);

  return {
    state,
    doc,
    dispatch,
    undo,
    redo,
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
  };
}
