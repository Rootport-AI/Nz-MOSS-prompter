import { useCallback, useEffect, useMemo, useState } from "react";
import { CanvasStage } from "./components/CanvasStage";
import { ImportModal } from "./components/ImportModal";
import { JsonView } from "./components/JsonView";
import { LeftSidebar } from "./components/LeftSidebar";
import { RightSidebar } from "./components/RightSidebar";
import { Toolbar } from "./components/Toolbar";
import { serializeModelLayout } from "./core/serializer";
import type { BBoxYxyx, ItemLabel, ThemeMode } from "./core/types";
import { validateDocument } from "./core/validation";
import {
  shouldIgnoreGlobalShortcut,
  useEditorStore,
} from "./state/useEditorStore";

const THEME_STORAGE_KEY = "nz-moss-prompter/theme";

function loadInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Ignore storage access errors
  }
  return "light";
}

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

export function App() {
  const { state, doc, dispatch, undo, redo } = useEditorStore();
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const [importOpen, setImportOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage access errors
    }
  }, [theme]);

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

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  // Global keyboard shortcuts (Undo / Redo / Delete / Duplicate)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        shouldIgnoreGlobalShortcut(
          target,
          importOpen,
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
        dispatch({ type: "DUPLICATE_ITEM", id: state.selectedId });
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId) {
        e.preventDefault();
        dispatch({ type: "DELETE_ITEM", id: state.selectedId });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, importOpen, redo, state.selectedId, undo]);

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
        theme={theme}
        onAddItem={handleAddItem}
        onOpenImport={() => setImportOpen(true)}
        onToggleTheme={handleToggleTheme}
      />

      <div className="workspace">
        <LeftSidebar
          doc={doc}
          selectedId={state.selectedId}
          activeView={state.activeView}
          open={state.leftOpen}
          theme={theme}
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
              theme={theme}
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

      {importOpen && (
        <ImportModal
          currentWidth={doc.width}
          currentHeight={doc.height}
          onClose={() => setImportOpen(false)}
          onImport={(document) =>
            dispatch({ type: "IMPORT_DOCUMENT", document })
          }
        />
      )}
    </div>
  );
}
