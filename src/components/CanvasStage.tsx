import type Konva from "konva";
import { useCallback, useEffect, useRef, useState } from "react";
import { Group, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import {
  clamp,
  isBBoxValid,
  resizeBBoxFromCanvasRect,
  translateBBox,
  yxyxToCanvasRect,
} from "../core/coordinates";
import {
  type BBoxYxyx,
  type CanvasRect,
  type DocumentState,
  type EditorItem,
  ITEM_LABELS,
  type ItemLabel,
  type ThemeMode,
  getItemTheme,
} from "../core/types";

interface CanvasStageProps {
  doc: DocumentState;
  selectedId: string | null;
  theme: ThemeMode;
  onSelectItem: (id: string | null, forceOpenRight?: boolean) => void;
  onUpdateBBox: (id: string, bbox: BBoxYxyx) => void;
  onChangeItemLabel: (id: string, label: ItemLabel) => void;
  onCommitInlineText: (id: string, value: string, isTextLabel: boolean) => void;
}

interface EditingSession {
  id: string;
  isTextLabel: boolean;
  value: string;
  initialValue: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  bg: string;
  ink: string;
  line: string;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3.0;
const GEAR_SIZE = 24;
const HEADER_HEIGHT = 22;

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function CanvasStage({
  doc,
  selectedId,
  theme,
  onSelectItem,
  onUpdateBBox,
  onChangeItemLabel,
  onCommitInlineText,
}: CanvasStageProps) {
  const isDark = theme === "dark";
  const artboardFill = isDark ? "#18202c" : "#ffffff";
  const artboardStroke = isDark ? "#334155" : "#bec8d6";
  const axisStroke = isDark ? "#334155" : "#cdd5df";
  const selectedStroke = isDark ? "#60a5fa" : "#286be6";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const rectRefs = useRef<Map<string, Konva.Rect>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [zoom, setZoom] = useState(0.65);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [hasFittedOnce, setHasFittedOnce] = useState(false);

  // Live preview geometry for the single item being dragged or resized
  const [interacting, setInteracting] = useState<{
    id: string;
    rect: CanvasRect;
  } | null>(null);
  const dragOriginBBoxRef = useRef<Map<string, BBoxYxyx>>(new Map());

  // Space-bar or middle-mouse panning
  const [spacePressed, setSpacePressed] = useState(false);
  const panDragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  // Inline textarea editing session
  const [editing, setEditing] = useState<EditingSession | null>(null);
  const composingRef = useRef(false);
  const justComposedRef = useRef(false);

  const commitEditing = useCallback(
    (session: EditingSession | null) => {
      if (!session) return;
      if (session.value !== session.initialValue) {
        onCommitInlineText(session.id, session.value, session.isTextLabel);
      }
      setEditing(null);
    },
    [onCommitInlineText],
  );

  const fitCanvasToViewport = useCallback(
    (vpWidth: number, vpHeight: number, canvasW: number, canvasH: number) => {
      if (vpWidth <= 0 || vpHeight <= 0) return;
      const pad = 44;
      const availW = Math.max(100, vpWidth - pad * 2);
      const availH = Math.max(100, vpHeight - pad * 2);
      const nextZoom = clamp(
        Math.min(availW / canvasW, availH / canvasH),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      const nextPanX = Math.round((vpWidth - canvasW * nextZoom) / 2);
      const nextPanY = Math.round((vpHeight - canvasH * nextZoom) / 2);
      setZoom(nextZoom);
      setPan({ x: nextPanX, y: nextPanY });
    },
    [],
  );

  // Track container resize via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(100, Math.floor(rect.width));
      const h = Math.max(100, Math.floor(rect.height));
      setViewport((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h },
      );
      setEditing((cur) => {
        if (cur) {
          if (cur.value !== cur.initialValue) {
            onCommitInlineText(cur.id, cur.value, cur.isTextLabel);
          }
          return null;
        }
        return null;
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [onCommitInlineText]);

  // Initial auto-fit once viewport is measured
  useEffect(() => {
    if (!hasFittedOnce && viewport.width > 100 && viewport.height > 100) {
      fitCanvasToViewport(viewport.width, viewport.height, doc.width, doc.height);
      setHasFittedOnce(true);
    }
  }, [hasFittedOnce, viewport.width, viewport.height, doc.width, doc.height, fitCanvasToViewport]);

  // Space-bar pan mode (ignored when typing in inputs/textareas)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toUpperCase();
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      setSpacePressed(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpacePressed(false);
    };
    const onBlur = () => setSpacePressed(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Sync Konva Transformer attached node strictly with selectedId, items, and editing state
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    if (!selectedId || editing !== null) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = rectRefs.current.get(selectedId);
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, doc.items, editing]);

  // Focus textarea when inline editing starts
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editing?.id]);

  const applyZoom = useCallback(
    (nextZoomRaw: number, anchor?: { x: number; y: number }) => {
      commitEditing(editing);
      const nextZoom = clamp(nextZoomRaw, MIN_ZOOM, MAX_ZOOM);
      const cx = anchor?.x ?? viewport.width / 2;
      const cy = anchor?.y ?? viewport.height / 2;
      const worldX = (cx - pan.x) / zoom;
      const worldY = (cy - pan.y) / zoom;
      setZoom(nextZoom);
      setPan({
        x: Math.round(cx - worldX * nextZoom),
        y: Math.round(cy - worldY * nextZoom),
      });
    },
    [commitEditing, editing, pan.x, pan.y, viewport.height, viewport.width, zoom],
  );

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    const factor = e.evt.deltaY < 0 ? 1.12 : 1 / 1.12;
    applyZoom(zoom * factor, pointer ?? undefined);
  };

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 1 || (spacePressed && e.evt.button === 0)) {
      e.evt.preventDefault();
      commitEditing(editing);
      panDragRef.current = {
        startClientX: e.evt.clientX,
        startClientY: e.evt.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
      return;
    }

    const target = e.target;
    const isDeselectTarget =
      target === target.getStage() ||
      target.name() === "canvas-deselect-target";
    if (isDeselectTarget) {
      commitEditing(editing);
      onSelectItem(null);
    }
  };

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!panDragRef.current) return;
    const dx = e.evt.clientX - panDragRef.current.startClientX;
    const dy = e.evt.clientY - panDragRef.current.startClientY;
    setPan({
      x: Math.round(panDragRef.current.startPanX + dx),
      y: Math.round(panDragRef.current.startPanY + dy),
    });
  };

  const handleStageMouseUp = () => {
    panDragRef.current = null;
  };

  const startInlineEditing = (item: EditorItem) => {
    const node = rectRefs.current.get(item.id);
    if (!node) return;
    const absPos = node.getAbsolutePosition();
    const absScale = node.getAbsoluteScale();
    const itemTheme = getItemTheme(item.label, theme);
    const isTextLabel = item.label === "text";
    const initialValue = isTextLabel ? item.text : item.caption;

    const rawWidth = node.width() * absScale.x;
    const rawHeight = node.height() * absScale.y;
    const headerScreenH = Math.min(HEADER_HEIGHT * absScale.y, rawHeight * 0.4);

    const width = Math.max(160, Math.round(rawWidth));
    const height = Math.max(64, Math.round(rawHeight - headerScreenH));
    const maxLeft = Math.max(4, viewport.width - width - 4);
    const maxTop = Math.max(4, viewport.height - height - 4);
    const left = clamp(Math.round(absPos.x), 4, maxLeft);
    const top = clamp(Math.round(absPos.y + headerScreenH), 4, maxTop);

    composingRef.current = false;
    justComposedRef.current = false;
    setEditing({
      id: item.id,
      isTextLabel,
      value: initialValue,
      initialValue,
      left,
      top,
      width,
      height,
      fontSize: clamp(Math.round(13 * absScale.y), 12, 22),
      bg: itemTheme.bg,
      ink: itemTheme.ink,
      line: itemTheme.line,
    });
  };

  return (
    <div
      ref={containerRef}
      className={`canvas-stage-container${spacePressed ? " panning" : ""}`}
    >
      <Stage
        ref={stageRef}
        width={viewport.width}
        height={viewport.height}
        x={pan.x}
        y={pan.y}
        scaleX={zoom}
        scaleY={zoom}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={handleStageMouseUp}
      >
        <Layer>
          {/* Artboard background */}
          <Rect
            name="canvas-deselect-target"
            x={0}
            y={0}
            width={doc.width}
            height={doc.height}
            fill={artboardFill}
            stroke={artboardStroke}
            strokeWidth={1 / zoom}
            shadowColor={isDark ? "#000000" : "#233044"}
            shadowBlur={14 / zoom}
            shadowOpacity={isDark ? 0.4 : 0.12}
            shadowOffsetY={3 / zoom}
          />

          {/* Center origin (0, 0) dashed axes */}
          <Line
            points={[doc.width / 2, 0, doc.width / 2, doc.height]}
            stroke={axisStroke}
            strokeWidth={1 / zoom}
            dash={[6 / zoom, 4 / zoom]}
            listening={false}
          />
          <Line
            points={[0, doc.height / 2, doc.width, doc.height / 2]}
            stroke={axisStroke}
            strokeWidth={1 / zoom}
            dash={[6 / zoom, 4 / zoom]}
            listening={false}
          />

          {/* Layout items (back to front) */}
          {doc.items.map((item, index) => {
            const baseRect = yxyxToCanvasRect(item.bbox, doc.width, doc.height);
            const displayRect =
              interacting?.id === item.id ? interacting.rect : baseRect;
            const itemTheme = getItemTheme(item.label, theme);
            const valid = isBBoxValid(item.bbox, doc.width, doc.height);
            const isSelected = item.id === selectedId;
            const isEditingThis = editing?.id === item.id;
            const bodyText =
              item.label === "text" ? item.text || "(テキスト未入力)" : item.caption || "(説明未入力)";
            const showHeader = displayRect.height >= 28 && displayRect.width >= 48;
            const headerH = showHeader ? Math.min(HEADER_HEIGHT, displayRect.height * 0.45) : 0;

            return (
              <Group key={item.id}>
                {/* Interactive bbox Rect (Transformer attaches ONLY to this node) */}
                <Rect
                  ref={(node) => {
                    if (node) rectRefs.current.set(item.id, node);
                    else rectRefs.current.delete(item.id);
                  }}
                  x={baseRect.x}
                  y={baseRect.y}
                  width={Math.max(1, baseRect.width)}
                  height={Math.max(1, baseRect.height)}
                  fill={itemTheme.bg}
                  opacity={valid ? 0.92 : 0.65}
                  stroke={
                    !valid
                      ? "#ef4444"
                      : isSelected
                        ? selectedStroke
                        : itemTheme.line
                  }
                  strokeWidth={(isSelected ? 2 : 1.5) / zoom}
                  dash={!valid ? [6 / zoom, 4 / zoom] : undefined}
                  draggable={!spacePressed && !isEditingThis}
                  onMouseDown={(e) => {
                    if (spacePressed || e.evt.button === 1) return;
                    e.cancelBubble = true;
                    commitEditing(editing);
                    onSelectItem(item.id);
                  }}
                  onTap={() => {
                    commitEditing(editing);
                    onSelectItem(item.id);
                  }}
                  onDblClick={(e) => {
                    e.cancelBubble = true;
                    onSelectItem(item.id);
                    startInlineEditing(item);
                  }}
                  onDblTap={() => {
                    onSelectItem(item.id);
                    startInlineEditing(item);
                  }}
                  onDragStart={() => {
                    dragOriginBBoxRef.current.set(item.id, [...item.bbox]);
                    setInteracting({ id: item.id, rect: baseRect });
                  }}
                  onDragMove={(e) => {
                    const node = e.target as Konva.Rect;
                    setInteracting({
                      id: item.id,
                      rect: {
                        x: node.x(),
                        y: node.y(),
                        width: node.width(),
                        height: node.height(),
                      },
                    });
                  }}
                  onDragEnd={(e) => {
                    const node = e.target as Konva.Rect;
                    const origBBox =
                      dragOriginBBoxRef.current.get(item.id) ?? item.bbox;
                    dragOriginBBoxRef.current.delete(item.id);
                    const origRect = yxyxToCanvasRect(
                      origBBox,
                      doc.width,
                      doc.height,
                    );
                    const dx = node.x() - origRect.x;
                    const dy = node.y() - origRect.y;
                    const nextBBox = translateBBox(
                      origBBox,
                      dx,
                      dy,
                      doc.width,
                      doc.height,
                    );
                    // Force-sync Konva node to committed integer bbox even if React skips re-render
                    const synced = yxyxToCanvasRect(
                      nextBBox,
                      doc.width,
                      doc.height,
                    );
                    node.x(synced.x);
                    node.y(synced.y);
                    setInteracting(null);
                    onUpdateBBox(item.id, nextBBox);
                  }}
                  onTransformStart={() => {
                    setInteracting({ id: item.id, rect: baseRect });
                  }}
                  onTransform={(e) => {
                    const node = e.target as Konva.Rect;
                    const nextW = Math.max(1, node.width() * node.scaleX());
                    const nextH = Math.max(1, node.height() * node.scaleY());
                    node.scaleX(1);
                    node.scaleY(1);
                    node.width(nextW);
                    node.height(nextH);
                    setInteracting({
                      id: item.id,
                      rect: {
                        x: node.x(),
                        y: node.y(),
                        width: nextW,
                        height: nextH,
                      },
                    });
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.Rect;
                    const nextW = Math.max(1, node.width() * node.scaleX());
                    const nextH = Math.max(1, node.height() * node.scaleY());
                    const nextBBox = resizeBBoxFromCanvasRect(
                      {
                        x: node.x(),
                        y: node.y(),
                        width: nextW,
                        height: nextH,
                      },
                      doc.width,
                      doc.height,
                    );
                    // Force-sync Konva node attributes to committed integer bbox
                    const synced = yxyxToCanvasRect(
                      nextBBox,
                      doc.width,
                      doc.height,
                    );
                    node.scaleX(1);
                    node.scaleY(1);
                    node.x(synced.x);
                    node.y(synced.y);
                    node.width(Math.max(1, synced.width));
                    node.height(Math.max(1, synced.height));
                    setInteracting(null);
                    onUpdateBBox(item.id, nextBBox);
                  }}
                />

                {/* Non-interactive clipped visual overlay (header badge + body text) */}
                <Group
                  x={displayRect.x}
                  y={displayRect.y}
                  clipX={0}
                  clipY={0}
                  clipWidth={Math.max(1, displayRect.width)}
                  clipHeight={Math.max(1, displayRect.height)}
                  listening={false}
                >
                  {showHeader && (
                    <>
                      <Rect
                        x={0}
                        y={0}
                        width={displayRect.width}
                        height={headerH}
                        fill={itemTheme.head}
                      />
                      {(interacting?.id === item.id ||
                        editing?.id === item.id ||
                        displayRect.width * zoom < 96 ||
                        displayRect.height * zoom < 32) && (
                        <Text
                          x={6}
                          y={Math.max(2, (headerH - 12) / 2)}
                          width={Math.max(10, displayRect.width - 34)}
                          text={`${titleCase(item.label)} ${index + 1}`}
                          fontSize={12}
                          fontStyle="600"
                          fill={itemTheme.ink}
                          ellipsis
                          wrap="none"
                        />
                      )}
                    </>
                  )}
                  {!isEditingThis && displayRect.width >= 20 && displayRect.height >= 16 && (
                    <Text
                      x={7}
                      y={headerH + 6}
                      width={Math.max(8, displayRect.width - 14)}
                      height={Math.max(8, displayRect.height - headerH - 10)}
                      text={bodyText}
                      fontSize={13}
                      lineHeight={1.4}
                      fill={itemTheme.ink}
                      wrap="word"
                      ellipsis
                    />
                  )}
                </Group>
              </Group>
            );
          })}

          {/* Single shared Transformer for the selected item */}
          <Transformer
            ref={transformerRef}
            rotateEnabled={false}
            flipEnabled={false}
            keepRatio={false}
            ignoreStroke
            anchorSize={8}
            anchorStroke={selectedStroke}
            anchorFill={isDark ? "#0f172a" : "#ffffff"}
            borderStroke={selectedStroke}
            borderDash={[4, 3]}
            boundBoxFunc={(oldBox, newBox) => {
              const minScreen = Math.max(1 * zoom, 1);
              if (newBox.width < minScreen || newBox.height < minScreen) {
                return oldBox;
              }
              return newBox;
            }}
          />
        </Layer>
      </Stage>

      {/* Fixed-size ⚙ button overlay layer (clipped to canvas container) */}
      <div className="canvas-overlay-layer">
        {doc.items.map((item, index) => {
          if (interacting?.id === item.id || editing?.id === item.id) {
            return null;
          }
          const rect = yxyxToCanvasRect(item.bbox, doc.width, doc.height);
          const screenLeft = rect.x * zoom + pan.x;
          const screenTop = rect.y * zoom + pan.y;
          const screenW = rect.width * zoom;
          const screenH = rect.height * zoom;
          const screenRight = screenLeft + screenW;

          // Keep ⚙ always clickable even for tiny boxes by offsetting outside top-right
          const isTiny = screenW < 48 || screenH < 48;
          const btnLeft = Math.round(
            isTiny ? screenRight + 4 : screenRight - GEAR_SIZE - 2,
          );
          const btnTop = Math.round(isTiny ? screenTop - 4 : screenTop + 2);
          const isSelected = item.id === selectedId;
          const itemTheme = getItemTheme(item.label, theme);
          const showLabelSelect = screenW >= 96 && screenH >= 32;
          const headerScreenH = Math.max(
            18,
            Math.min(HEADER_HEIGHT * zoom, screenH * 0.45),
          );
          const selectWidth = Math.max(
            68,
            Math.min(118, screenW - GEAR_SIZE - 10),
          );
          const baseZ = isSelected ? doc.items.length + 10 : index + 1;

          return (
            <div key={item.id}>
              {showLabelSelect && (
                <select
                  className="canvas-label-select"
                  aria-label={`${titleCase(item.label)} ${index + 1} の種類を変更`}
                  value={item.label}
                  style={{
                    left: `${Math.round(screenLeft + 3)}px`,
                    top: `${Math.round(screenTop + 1)}px`,
                    width: `${Math.round(selectWidth)}px`,
                    height: `${Math.round(headerScreenH - 2)}px`,
                    zIndex: baseZ,
                    color: itemTheme.ink,
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    onSelectItem(item.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    onSelectItem(item.id);
                    onChangeItemLabel(item.id, e.target.value as ItemLabel);
                  }}
                >
                  {ITEM_LABELS.map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {titleCase(lbl)}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                className={`canvas-gear-btn${isSelected ? " active" : ""}${isTiny ? " tiny-offset" : ""}`}
                style={{
                  left: `${btnLeft}px`,
                  top: `${btnTop}px`,
                  zIndex: baseZ,
                  color: itemTheme.ink,
                  borderColor: isSelected ? selectedStroke : itemTheme.line,
                }}
                title={`${titleCase(item.label)} ${index + 1} の詳細設定を開く`}
                aria-label={`${titleCase(item.label)} ${index + 1} の詳細設定を開く`}
                onClick={(e) => {
                  e.stopPropagation();
                  commitEditing(editing);
                  onSelectItem(item.id, true);
                }}
              >
                ⚙
              </button>
            </div>
          );
        })}

        {/* Inline text editing textarea overlay (IME & multi-line safe) */}
        {editing && (
          <textarea
            ref={textareaRef}
            className="canvas-inline-textarea"
            aria-label={
              editing.isTextLabel ? "描画テキストを編集" : "キャプションを編集"
            }
            value={editing.value}
            style={{
              left: `${editing.left}px`,
              top: `${editing.top}px`,
              width: `${editing.width}px`,
              height: `${editing.height}px`,
              fontSize: `${editing.fontSize}px`,
              background: editing.bg,
              color: editing.ink,
              borderColor: editing.line,
            }}
            onCompositionStart={() => {
              composingRef.current = true;
              justComposedRef.current = false;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
              justComposedRef.current = true;
            }}
            onChange={(e) => {
              const val = e.target.value;
              setEditing((prev) => (prev ? { ...prev, value: val } : null));
            }}
            onKeyDown={(e) => {
              const safariConfirm = justComposedRef.current && e.keyCode === 229;
              justComposedRef.current = false;
              if (composingRef.current || e.nativeEvent.isComposing || safariConfirm) {
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setEditing(null);
              } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commitEditing(editing);
              }
            }}
            onBlur={() => commitEditing(editing)}
          />
        )}
      </div>

      {/* Floating zoom & view controls */}
      <div className="zoom-controls" aria-label="キャンバスズーム操作">
        <button
          type="button"
          className="zoom-btn"
          onClick={() => applyZoom(zoom / 1.2)}
          title="縮小"
          aria-label="縮小"
        >
          −
        </button>
        <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="zoom-btn"
          onClick={() => applyZoom(zoom * 1.2)}
          title="拡大"
          aria-label="拡大"
        >
          ＋
        </button>
        <button
          type="button"
          className="zoom-btn zoom-fit"
          onClick={() => {
            commitEditing(editing);
            fitCanvasToViewport(
              viewport.width,
              viewport.height,
              doc.width,
              doc.height,
            );
          }}
          title="画面にフィット"
        >
          Fit
        </button>
      </div>
    </div>
  );
}
