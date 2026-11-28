import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasStage } from "./components/CanvasStage";
import { ImportModal } from "./components/ImportModal";
import { JsonView } from "./components/JsonView";
import { LeftSidebar } from "./components/LeftSidebar";
import { RightSidebar } from "./components/RightSidebar";
import { SettingsModal } from "./components/SettingsModal";
import { Toolbar } from "./components/Toolbar";
import {
  type ImportResult,
  parseImportJson,
  selectDroppedImportFile,
  serializeModelLayout,
} from "./core/serializer";
import {
  type AppSettings,
  getSafeLocalStorage,
  loadAppSettings,
  sanitizeAppSettings,
  saveAppSettings,
} from "./core/settings";
import type { BBoxYxyx, EditorItem, ItemLabel } from "./core/types";
import { validateDocument } from "./core/validation";
import {
  shouldIgnoreGlobalShortcut,
  useEditorStore,
} from "./state/useEditorStore";

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.left = "-10000px";
    helper.style.top = "0";
    document.body.appendChild(helper);
    helper.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    helper.remove();
    return ok;
  }
}

const MAX_MODAL_PREVIEW_CHARS = 500_000;

interface ImportModalState {
  open: boolean;
  nonce: number;
  initialRawText?: string;
  initialError?: string | null;
  initialPending?: ImportResult | null;
}

function hasDraggedFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes("Files");
}

export function App() {
  const { state, doc, dispatch, undo, redo } = useEditorStore();
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadAppSettings(getSafeLocalStorage()),
  );
  const [importModal, setImportModal] = useState<ImportModalState>({
    open: false,
    nonce: 0,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const importNoticeTimerRef = useRef<number | null>(null);
  const docSizeRef = useRef({ width: doc.width, height: doc.height });
  docSizeRef.current = { width: doc.width, height: doc.height };
  const dropRequestIdRef = useRef(0);

  const clearImportNotice = useCallback(() => {
    if (importNoticeTimerRef.current !== null) {
      window.clearTimeout(importNoticeTimerRef.current);
      importNoticeTimerRef.current = null;
    }
    setImportNotice(null);
  }, []);

  const openImportModal = useCallback(
    (seed?: Omit<ImportModalState, "open" | "nonce">) => {
      clearImportNotice();
      setImportModal((prev) => ({
        open: true,
        nonce: prev.nonce + 1,
        initialRawText: seed?.initialRawText,
        initialError: seed?.initialError,
        initialPending: seed?.initialPending,
      }));
    },
    [clearImportNotice],
  );

  const closeImportModal = useCallback(() => {
    setImportModal((prev) => ({ open: false, nonce: prev.nonce }));
  }, []);

  // In-app clipboard for Canvas rectangle copy/paste
  const copiedItemRef = useRef<Omit<EditorItem, "id"> | null>(null);
  const pasteCountRef = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    saveAppSettings(getSafeLocalStorage(), settings);
  }, [settings]);

  // Prevent browser/WebView navigation when files are accidentally dropped outside drop zones
  useEffect(() => {
    const onWindowDragOver = (e: DragEvent) => {
      if (!hasDraggedFiles(e.dataTransfer)) return;
      if (e.target instanceof HTMLInputElement && e.target.type === "file") {
        return;
      }
      if (!e.defaultPrevented) {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "none";
        }
      }
    };
    const onWindowDrop = (e: DragEvent) => {
      if (!hasDraggedFiles(e.dataTransfer)) return;
      if (e.target instanceof HTMLInputElement && e.target.type === "file") {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);
    return () => {
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (importNoticeTimerRef.current !== null) {
        window.clearTimeout(importNoticeTimerRef.current);
      }
    };
  }, []);

  const showImportNotice = useCallback((message: string) => {
    if (importNoticeTimerRef.current !== null) {
      window.clearTimeout(importNoticeTimerRef.current);
    }
    setImportNotice(message);
    importNoticeTimerRef.current = window.setTimeout(() => {
      setImportNotice(null);
      importNoticeTimerRef.current = null;
    }, 2500);
  }, []);

  const handleDropImportFiles = useCallback(
    async (fileList: FileList) => {
      const requestId = ++dropRequestIdRef.current;
      const { file, error } = selectDroppedImportFile(Array.from(fileList));
      if (error || !file) {
        openImportModal({
          initialRawText: "",
          initialError: error ?? "ファイルを読み込めませんでした。",
          initialPending: null,
        });
        return;
      }

      let text: string;
      try {
        text = await file.text();
      } catch {
        if (dropRequestIdRef.current !== requestId) return;
        openImportModal({
          initialRawText: "",
          initialError:
            "ファイルの読み込みに失敗しました（フォルダや読み取り不可のファイルは読み込めません）。",
          initialPending: null,
        });
        return;
      }

      if (dropRequestIdRef.current !== requestId) return;

      try {
        const { width, height } = docSizeRef.current;
        const result = parseImportJson(text, width, height);
        if (
          result.kind === "model" &&
          result.hasOutOfBounds &&
          (result.suggestedCanvas !== null || result.exceedsMaxCanvasSize)
        ) {
          openImportModal({
            initialRawText: text,
            initialError: null,
            initialPending: result,
          });
          return;
        }
        dispatch({ type: "IMPORT_DOCUMENT", document: result.document });
        showImportNotice(`「${file.name}」をインポートしました`);
      } catch (err) {
        const safePreviewText =
          text.includes("\0") || text.length > MAX_MODAL_PREVIEW_CHARS
            ? ""
            : text;
        openImportModal({
          initialRawText: safePreviewText,
          initialError: err instanceof Error ? err.message : String(err),
          initialPending: null,
        });
      }
    },
    [dispatch, openImportModal, showImportNotice],
  );

  const handleChangeSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => sanitizeAppSettings({ ...prev, ...patch }));
  }, []);

  const issues = useMemo(() => validateDocument(doc), [doc]);
  const prettyJson = useMemo(() => serializeModelLayout(doc, true), [doc]);
  const copyJsonText = useMemo(
    () => serializeModelLayout(doc, !state.copyCompact),
    [doc, state.copyCompact],
  );

  const selectedIndex = useMemo(
    () => doc.items.findIndex((item) => item.id === state.selectedId),
    [doc.items, state.selectedId],
  );
  const selectedItem = selectedIndex >= 0 ? doc.items[selectedIndex] : null;

  const handleCopyJson = useCallback(async () => {
    const ok = await copyToClipboard(copyJsonText);
    setCopyFeedback(ok ? "Copied!" : "Failed");
    window.setTimeout(() => setCopyFeedback(null), 1400);
  }, [copyJsonText]);

  const handleExportModel = useCallback(() => {
    downloadTextFile("moss-layout.json", `${prettyJson}\n`);
  }, [prettyJson]);

  const isModalOpen = importModal.open || settingsOpen;

  // Global keyboard shortcuts (Undo / Redo / Delete / Duplicate / Copy & Paste)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        shouldIgnoreGlobalShortcut(
          target,
          isModalOpen,
          e.isComposing || e.keyCode === 229,
        )
      ) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((mod && key === "y") || (mod && key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && key === "d" && state.selectedId) {
        e.preventDefault();
        if (e.repeat) return;
        dispatch({ type: "DUPLICATE_ITEM", id: state.selectedId });
        return;
      }

      if (state.activeView === "canvas" && mod && !e.shiftKey && !e.altKey) {
        if (key === "c" && selectedItem) {
          const hasTextSelection =
            (window.getSelection()?.toString() ?? "").length > 0;
          if (hasTextSelection) return;
          e.preventDefault();
          copiedItemRef.current = {
            label: selectedItem.label,
            caption: selectedItem.caption,
            text: selectedItem.text,
            tags: [...selectedItem.tags],
            palette: [...selectedItem.palette],
            bbox: [...selectedItem.bbox] as BBoxYxyx,
          };
          pasteCountRef.current = 0;
          return;
        }
        if (key === "v" && copiedItemRef.current) {
          e.preventDefault();
          if (e.repeat) return;
          pasteCountRef.current += 1;
          dispatch({
            type: "PASTE_ITEM",
            item: copiedItemRef.current,
            offsetStep: pasteCountRef.current,
          });
          return;
        }
      }

      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId) {
        e.preventDefault();
        dispatch({ type: "DELETE_ITEM", id: state.selectedId });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    dispatch,
    isModalOpen,
    redo,
    selectedItem,
    state.activeView,
    state.selectedId,
    undo,
  ]);

  const handleAddItem = useCallback(
    (label: ItemLabel) => dispatch({ type: "ADD_ITEM", label }),
    [dispatch],
  );

  const handleUpdateBBox = useCallback(
    (id: string, bbox: BBoxYxyx) =>
      dispatch({ type: "UPDATE_ITEM", id, patch: { bbox } }),
    [dispatch],
  );

  const handleChangeItemLabel = useCallback(
    (id: string, label: ItemLabel) =>
      dispatch({ type: "UPDATE_ITEM", id, patch: { label } }),
    [dispatch],
  );

  const handleCommitInlineText = useCallback(
    (id: string, value: string, isTextLabel: boolean) => {
      dispatch({
        type: "UPDATE_ITEM",
        id,
        patch: isTextLabel ? { text: value } : { caption: value },
      });
    },
    [dispatch],
  );

  return (
    <div id="app">
      <Toolbar
        width={doc.width}
        height={doc.height}
        onAddItem={handleAddItem}
        onOpenImport={() => openImportModal()}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="workspace">
        <LeftSidebar
          doc={doc}
          selectedId={state.selectedId}
          activeView={state.activeView}
          open={state.leftOpen}
          theme={settings.theme}
          issueCount={issues.length}
          onToggleOpen={() =>
            dispatch({ type: "SET_LEFT_OPEN", open: !state.leftOpen })
          }
          onChangeView={(view) => dispatch({ type: "SET_VIEW", view })}
          onChangeSize={(width, height) =>
            dispatch({ type: "SET_CANVAS_SIZE", width, height })
          }
          onUpdateSummary={(patch, coalesceKey) =>
            dispatch({ type: "UPDATE_SUMMARY", patch, coalesceKey })
          }
          onSelectItem={(id) => dispatch({ type: "SELECT_ITEM", id })}
          onReorderItem={(id, direction) =>
            dispatch({ type: "REORDER_ITEM", id, direction })
          }
        />

        <main className="stage">
          {state.activeView === "canvas" ? (
            <CanvasStage
              doc={doc}
              selectedId={state.selectedId}
              theme={settings.theme}
              rectTitleFontSize={settings.rectTitleFontSize}
              rectBodyFontSize={settings.rectBodyFontSize}
              importNotice={importNotice}
              onDropFiles={handleDropImportFiles}
              onSelectItem={(id, forceOpenRight) =>
                dispatch({ type: "SELECT_ITEM", id, forceOpenRight })
              }
              onUpdateBBox={handleUpdateBBox}
              onChangeItemLabel={handleChangeItemLabel}
              onCommitInlineText={handleCommitInlineText}
            />
          ) : (
            <JsonView
              prettyJson={prettyJson}
              copyCompact={state.copyCompact}
              issues={issues}
              copyFeedback={copyFeedback}
              onChangeCopyCompact={(compact) =>
                dispatch({ type: "SET_COPY_COMPACT", compact })
              }
              onCopy={handleCopyJson}
              onExport={handleExportModel}
            />
          )}
        </main>

        <RightSidebar
          item={selectedItem}
          itemIndex={selectedIndex}
          canvasWidth={doc.width}
          canvasHeight={doc.height}
          open={state.rightOpen}
          issues={issues}
          onToggleOpen={() =>
            dispatch({ type: "SET_RIGHT_OPEN", open: !state.rightOpen })
          }
          onUpdateItem={(id, patch, coalesceKey) =>
            dispatch({ type: "UPDATE_ITEM", id, patch, coalesceKey })
          }
          onDuplicateItem={(id) => dispatch({ type: "DUPLICATE_ITEM", id })}
          onDeleteItem={(id) => dispatch({ type: "DELETE_ITEM", id })}
        />
      </div>

      {importModal.open && (
        <ImportModal
          key={importModal.nonce}
          currentWidth={doc.width}
          currentHeight={doc.height}
          initialRawText={importModal.initialRawText}
          initialError={importModal.initialError}
          initialPending={importModal.initialPending}
          onClose={closeImportModal}
          onImport={(document) =>
            dispatch({ type: "IMPORT_DOCUMENT", document })
          }
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onChangeSettings={handleChangeSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
