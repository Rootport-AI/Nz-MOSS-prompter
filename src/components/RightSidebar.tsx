import { useEffect, useState } from "react";
import { isBBoxValid, normalizeZero } from "../core/coordinates";
import {
  type BBoxYxyx,
  type EditorItem,
  ITEM_LABELS,
  type ItemLabel,
  type ValidationIssue,
} from "../core/types";
import { TagListInput } from "./TagListInput";

interface RightSidebarProps {
  item: EditorItem | null;
  itemIndex: number;
  canvasWidth: number;
  canvasHeight: number;
  open: boolean;
  issues: ValidationIssue[];
  onToggleOpen: () => void;
  onUpdateItem: (
    id: string,
    patch: Partial<Omit<EditorItem, "id">>,
    coalesceKey?: string,
  ) => void;
  onDuplicateItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
}

const BBOX_LABELS = ["Y min", "X min", "Y max", "X max"] as const;

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function RightSidebar({
  item,
  itemIndex,
  canvasWidth,
  canvasHeight,
  open,
  issues,
  onToggleOpen,
  onUpdateItem,
  onDuplicateItem,
  onDeleteItem,
}: RightSidebarProps) {
  const [bboxDraft, setBBoxDraft] = useState<[string, string, string, string]>([
    "0",
    "0",
    "0",
    "0",
  ]);

  useEffect(() => {
    if (!item) return;
    setBBoxDraft([
      String(item.bbox[0]),
      String(item.bbox[1]),
      String(item.bbox[2]),
      String(item.bbox[3]),
    ]);
  }, [
    item?.id,
    item?.bbox[0],
    item?.bbox[1],
    item?.bbox[2],
    item?.bbox[3],
  ]);

  const isCollapsed = !open || item === null;
  const itemIssues = item ? issues.filter((i) => i.itemId === item.id) : [];
  const bboxValid = item
    ? isBBoxValid(item.bbox, canvasWidth, canvasHeight)
    : true;

  const commitBBoxIndex = (idx: 0 | 1 | 2 | 3, rawValue: string) => {
    if (!item) return;
    const trimmed = rawValue.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed)) {
      setBBoxDraft([
        String(item.bbox[0]),
        String(item.bbox[1]),
        String(item.bbox[2]),
        String(item.bbox[3]),
      ]);
      return;
    }
    const next: BBoxYxyx = [...item.bbox];
    next[idx] = normalizeZero(Math.round(parsed));
    onUpdateItem(item.id, { bbox: next }, `item.${item.id}.bbox.${idx}`);
  };

  // Show Text field when label === "text" (required), or if an imported non-text item carries non-empty text
  const showTextField =
    item !== null && (item.label === "text" || item.text.trim().length > 0);

  return (
    <aside className={`sidebar right${isCollapsed ? " collapsed" : ""}`}>
      <div className="panel-header">
        <strong className="side-title">Properties</strong>
        <button
          type="button"
          className="fold"
          disabled={item === null}
          onClick={onToggleOpen}
          title={
            item === null
              ? "矩形を選択してください"
              : isCollapsed
                ? "右パネルを展開"
                : "右パネルを最小化"
          }
          aria-label={isCollapsed ? "右パネルを展開" : "右パネルを最小化"}
        >
          {isCollapsed ? "≪" : "≫"}
        </button>
      </div>

      {item && (
        <div className="panel-content">
          <div className="selection-header">
            <span className="help-muted">
              Selected: {titleCase(item.label)} {itemIndex + 1}
            </span>
            <div className="selection-actions">
              <button
                type="button"
                className="mini-text-btn"
                onClick={() => onDuplicateItem(item.id)}
                title="複製 (Ctrl+D)"
              >
                Duplicate
              </button>
              <button
                type="button"
                className="mini-text-btn danger"
                onClick={() => onDeleteItem(item.id)}
                title="削除 (Delete)"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="divider" />

          <section className="section">
            <div>
              <label className="field-label" htmlFor="property-label">
                Label
              </label>
              <select
                id="property-label"
                className="field"
                value={item.label}
                onChange={(e) =>
                  onUpdateItem(item.id, {
                    label: e.target.value as ItemLabel,
                  })
                }
              >
                {ITEM_LABELS.map((lbl) => (
                  <option key={lbl} value={lbl}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="property-caption">
                Caption *
              </label>
              <textarea
                id="property-caption"
                className="field"
                rows={3}
                value={item.caption}
                placeholder="要素の見た目・配置・フォント等の説明"
                onChange={(e) =>
                  onUpdateItem(
                    item.id,
                    { caption: e.target.value },
                    `item.${item.id}.caption`,
                  )
                }
              />
            </div>

            {showTextField && (
              <div>
                <label className="field-label" htmlFor="property-text">
                  Text {item.label === "text" ? "*" : "(Optional)"}
                </label>
                <textarea
                  id="property-text"
                  className="field"
                  rows={3}
                  value={item.text}
                  placeholder="描画する文字列（改行可）"
                  onChange={(e) =>
                    onUpdateItem(
                      item.id,
                      { text: e.target.value },
                      `item.${item.id}.text`,
                    )
                  }
                />
              </div>
            )}

            <div>
              <label className="field-label" htmlFor="property-tags">
                Tags
              </label>
              <TagListInput
                id="property-tags"
                values={item.tags}
                resetKey={`${item.id}-tags`}
                placeholder="tag1, tag2"
                onChange={(tags) =>
                  onUpdateItem(item.id, { tags }, `item.${item.id}.tags`)
                }
              />
            </div>

            <div>
              <label className="field-label" htmlFor="property-palette">
                Palette
              </label>
              <TagListInput
                id="property-palette"
                values={item.palette}
                resetKey={`${item.id}-palette`}
                placeholder="red, white"
                onChange={(palette) =>
                  onUpdateItem(item.id, { palette }, `item.${item.id}.palette`)
                }
              />
            </div>
          </section>

          <div className="divider" />

          <section className="section">
            <div className="section-heading">Bounding Box (yxyx)</div>
            <div className="bbox-grid">
              {([0, 1, 2, 3] as const).map((idx) => (
                <div key={idx}>
                  <label className="field-label" htmlFor={`bbox-${idx}`}>
                    {BBOX_LABELS[idx]}
                  </label>
                  <input
                    id={`bbox-${idx}`}
                    className="field"
                    type="number"
                    step={1}
                    value={bboxDraft[idx]}
                    onChange={(e) => {
                      const val = e.target.value;
                      const nextDraft: [string, string, string, string] = [
                        ...bboxDraft,
                      ];
                      nextDraft[idx] = val;
                      setBBoxDraft(nextDraft);
                      // Sync immediately when valid integer is entered
                      if (/^-?\d+$/.test(val.trim())) {
                        commitBBoxIndex(idx, val);
                      }
                    }}
                    onBlur={(e) => commitBBoxIndex(idx, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        commitBBoxIndex(idx, e.currentTarget.value);
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="help-muted">
              範囲: X ±{canvasWidth / 2}, Y ±{canvasHeight / 2}
            </div>
            {!bboxValid && (
              <div className="help-error">
                座標がキャンバス範囲外、または最小・最大が逆転しています。
              </div>
            )}
          </section>

          {itemIssues.length > 0 && (
            <>
              <div className="divider" />
              <section className="section">
                <div className="section-heading help-error">Validation</div>
                <ul className="issue-list">
                  {itemIssues.map((issue, idx) => (
                    <li key={`${issue.path}-${idx}`} className="help-error">
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
