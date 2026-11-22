import { useEffect, useState } from "react";
import { isBBoxValid, snapDimension } from "../core/coordinates";
import {
  CANVAS_PRESETS,
  CANVAS_TYPES,
  type CanvasType,
  type DocumentState,
  MAX_CANVAS_SIZE,
  MIN_CANVAS_SIZE,
  type ThemeMode,
  getItemTheme,
} from "../core/types";
import { TagListInput } from "./TagListInput";

interface LeftSidebarProps {
  doc: DocumentState;
  selectedId: string | null;
  activeView: "canvas" | "json";
  open: boolean;
  theme: ThemeMode;
  issueCount: number;
  onToggleOpen: () => void;
  onChangeView: (view: "canvas" | "json") => void;
  onChangeSize: (width: number, height: number) => void;
  onUpdateSummary: (
    patch: Partial<DocumentState["summary"]>,
    coalesceKey?: string,
  ) => void;
  onSelectItem: (id: string) => void;
  onReorderItem: (id: string, direction: "forward" | "backward") => void;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function LeftSidebar({
  doc,
  selectedId,
  activeView,
  open,
  theme,
  issueCount,
  onToggleOpen,
  onChangeView,
  onChangeSize,
  onUpdateSummary,
  onSelectItem,
  onReorderItem,
}: LeftSidebarProps) {
  const [widthInput, setWidthInput] = useState(String(doc.width));
  const [heightInput, setHeightInput] = useState(String(doc.height));

  useEffect(() => {
    setWidthInput(String(doc.width));
  }, [doc.width]);

  useEffect(() => {
    setHeightInput(String(doc.height));
  }, [doc.height]);

  const commitDimension = (axis: "width" | "height") => {
    const raw = axis === "width" ? widthInput : heightInput;
    const num = Number(raw);
    if (!raw.trim() || !Number.isFinite(num) || num <= 0) {
      if (axis === "width") setWidthInput(String(doc.width));
      else setHeightInput(String(doc.height));
      return;
    }
    const snapped = snapDimension(num);
    if (axis === "width") {
      setWidthInput(String(snapped));
      onChangeSize(snapped, doc.height);
    } else {
      setHeightInput(String(snapped));
      onChangeSize(doc.width, snapped);
    }
  };

  const currentPresetValue = CANVAS_PRESETS.some(
    (p) => p.width === doc.width && p.height === doc.height,
  )
    ? `${doc.width}x${doc.height}`
    : "";

  return (
    <aside className={`sidebar left${open ? "" : " collapsed"}`}>
      <div className="panel-header">
        <div className="tabs" role="tablist" aria-label="中央表示を切り替え">
          <button
            type="button"
            className={`tab${activeView === "canvas" ? " active" : ""}`}
            role="tab"
            aria-selected={activeView === "canvas"}
            onClick={() => onChangeView("canvas")}
          >
            Canvas
          </button>
          <button
            type="button"
            className={`tab${activeView === "json" ? " active" : ""}`}
            role="tab"
            aria-selected={activeView === "json"}
            onClick={() => onChangeView("json")}
          >
            JSON
            {issueCount > 0 && (
              <span
                className="badge-warn"
                title={`${issueCount}件のバリデーション警告があります`}
              >
                {issueCount}
              </span>
            )}
          </button>
        </div>
        <button
          type="button"
          className="fold"
          onClick={onToggleOpen}
          title={open ? "左パネルを最小化" : "左パネルを展開"}
          aria-label={open ? "左パネルを最小化" : "左パネルを展開"}
        >
          {open ? "≪" : "≫"}
        </button>
      </div>

      <div className="panel-content">
        <section className="section">
          <div className="section-heading">Size</div>
          <div className="dimension-row">
            <label htmlFor="canvas-width">Width</label>
            <input
              id="canvas-width"
              className="field"
              type="number"
              min={MIN_CANVAS_SIZE}
              max={MAX_CANVAS_SIZE}
              step={16}
              value={widthInput}
              onChange={(e) => setWidthInput(e.target.value)}
              onBlur={() => commitDimension("width")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitDimension("width");
                  e.currentTarget.blur();
                }
              }}
            />
            <span className="coord-hint">X: ±{doc.width / 2}</span>
          </div>
          <div className="dimension-row">
            <label htmlFor="canvas-height">Height</label>
            <input
              id="canvas-height"
              className="field"
              type="number"
              min={MIN_CANVAS_SIZE}
              max={MAX_CANVAS_SIZE}
              step={16}
              value={heightInput}
              onChange={(e) => setHeightInput(e.target.value)}
              onBlur={() => commitDimension("height")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitDimension("height");
                  e.currentTarget.blur();
                }
              }}
            />
            <span className="coord-hint">Y: ±{doc.height / 2}</span>
          </div>
          <div>
            <select
              aria-label="解像度プリセット"
              className="field"
              value={currentPresetValue}
              onChange={(e) => {
                const [w, h] = e.target.value.split("x").map(Number);
                if (w && h) onChangeSize(w, h);
              }}
            >
              <option value="">Preset (16の倍数)</option>
              {CANVAS_PRESETS.map((preset) => (
                <option
                  key={preset.label}
                  value={`${preset.width}x${preset.height}`}
                >
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <div className="divider" />

        <section className="section">
          <div className="section-heading">Summary</div>
          <div>
            <label className="field-label" htmlFor="summary-caption">
              Caption *
            </label>
            <textarea
              id="summary-caption"
              className="field"
              rows={3}
              value={doc.summary.caption}
              placeholder="画像全体の説明文"
              onChange={(e) =>
                onUpdateSummary(
                  { caption: e.target.value },
                  "summary.caption",
                )
              }
            />
          </div>
          <div>
            <label className="field-label" htmlFor="summary-meta">
              Meta
            </label>
            <TagListInput
              id="summary-meta"
              values={doc.summary.meta}
              resetKey="summary-meta"
              placeholder="poster, illustration"
              onChange={(meta) => onUpdateSummary({ meta }, "summary.meta")}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="summary-canvas">
              Canvas
            </label>
            <select
              id="summary-canvas"
              className="field"
              value={doc.summary.canvas}
              onChange={(e) =>
                onUpdateSummary({
                  canvas: e.target.value as CanvasType | "",
                })
              }
            >
              <option value="">(未指定 / 省略)</option>
              {CANVAS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="summary-palette">
              Palette
            </label>
            <TagListInput
              id="summary-palette"
              values={doc.summary.palette}
              resetKey="summary-palette"
              placeholder="blue, white"
              onChange={(palette) =>
                onUpdateSummary({ palette }, "summary.palette")
              }
            />
          </div>
        </section>

        <div className="divider" />

        <section className="section">
          <div className="section-heading">
            Layers <span className="help-muted">({doc.items.length})</span>
          </div>
          <div className="layers">
            {doc.items.length === 0 && (
              <div className="help-muted">矩形がありません</div>
            )}
            {doc.items.map((item, index) => {
              const active = item.id === selectedId;
              const valid = isBBoxValid(item.bbox, doc.width, doc.height);
              const itemTheme = getItemTheme(item.label, theme);
              const preview =
                item.label === "text" ? item.text || item.caption : item.caption;
              return (
                <div
                  key={item.id}
                  className={`layer-row${active ? " active" : ""}`}
                >
                  <button
                    type="button"
                    className="layer-select"
                    onClick={() => onSelectItem(item.id)}
                    title={preview || titleCase(item.label)}
                  >
                    <span
                      className="layer-dot"
                      style={{
                        background: itemTheme.head,
                        borderColor: itemTheme.line,
                      }}
                    />
                    <span className="layer-name">
                      {titleCase(item.label)} {index + 1}
                    </span>
                    {!valid && (
                      <span
                        className="layer-warn"
                        title="座標がキャンバス範囲外または不正です"
                      >
                        !
                      </span>
                    )}
                  </button>
                  <div className="layer-order">
                    <button
                      type="button"
                      className="mini-btn"
                      disabled={index === doc.items.length - 1}
                      onClick={() => onReorderItem(item.id, "forward")}
                      title="前面へ移動"
                      aria-label="前面へ移動"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="mini-btn"
                      disabled={index === 0}
                      onClick={() => onReorderItem(item.id, "backward")}
                      title="背面へ移動"
                      aria-label="背面へ移動"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </aside>
  );
}
