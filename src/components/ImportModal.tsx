import { useState } from "react";
import { type ImportResult, parseImportJson } from "../core/serializer";
import { type DocumentState, MAX_CANVAS_SIZE } from "../core/types";

interface ImportModalProps {
  currentWidth: number;
  currentHeight: number;
  onClose: () => void;
  onImport: (doc: DocumentState) => void;
}

export function ImportModal({
  currentWidth,
  currentHeight,
  onClose,
  onImport,
}: ImportModalProps) {
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ImportResult | null>(null);

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setRawText(reader.result);
        setError(null);
        setPending(null);
      }
    };
    reader.onerror = () => {
      setError("ファイルの読み込みに失敗しました。");
    };
    reader.readAsText(file, "utf-8");
  };

  const handleAnalyze = () => {
    setError(null);
    try {
      const result = parseImportJson(rawText, currentWidth, currentHeight);
      if (
        result.kind === "model" &&
        result.hasOutOfBounds &&
        (result.suggestedCanvas !== null || result.exceedsMaxCanvasSize)
      ) {
        setPending(result);
        return;
      }
      onImport(result.document);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const confirmImport = (useSuggestedSize: boolean) => {
    if (!pending) return;
    if (useSuggestedSize && pending.suggestedCanvas) {
      onImport({
        ...pending.document,
        width: pending.suggestedCanvas.width,
        height: pending.suggestedCanvas.height,
      });
    } else {
      onImport(pending.document);
    }
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-header">
          <strong id="import-modal-title">Import JSON</strong>
          <button
            type="button"
            className="fold"
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <p className="help-muted">
            MOSS-Image モデル向け JSON（abs_centralized / yxyx）、Nz-MOSS
            プロジェクト JSON、または公式 Draft JSON（abs / xyxy）を読み込めます。
          </p>

          <div className="file-row">
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
          </div>

          <textarea
            className="field modal-textarea"
            rows={10}
            placeholder='{"summary": {"caption": "..."}, "items": [...], "bbox_coord_space": "abs_centralized", "bbox_format": "yxyx"}'
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              setError(null);
              setPending(null);
            }}
          />

          {error && <div className="help-error">{error}</div>}

          {pending && pending.suggestedCanvas && (
            <div className="import-confirm">
              <div className="help-error">
                読み込んだモデル JSON には現在のキャンバス解像度（
                {currentWidth} × {currentHeight}）を超える座標が含まれています。
              </div>
              <div className="import-confirm-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => confirmImport(true)}
                >
                  推奨解像度（{pending.suggestedCanvas.width} ×{" "}
                  {pending.suggestedCanvas.height}）に拡張して読み込む
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => confirmImport(false)}
                >
                  現在の解像度のまま読み込む
                </button>
              </div>
            </div>
          )}

          {pending && pending.exceedsMaxCanvasSize && pending.requiredCanvas && (
            <div className="import-confirm">
              <div className="help-error">
                すべての bbox を収めるには {pending.requiredCanvas.width} ×{" "}
                {pending.requiredCanvas.height} のキャンバスが必要ですが、上限（
                {MAX_CANVAS_SIZE}px）を超えています。このまま読み込むと一部の
                bbox が範囲外として警告表示されるため、読み込み後に座標を修正してください。
              </div>
              <div className="import-confirm-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => confirmImport(false)}
                >
                  現在の解像度（{currentWidth} × {currentHeight}）のまま読み込む
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          {!pending && (
            <button
              type="button"
              className="button button-primary"
              onClick={handleAnalyze}
              disabled={!rawText.trim()}
            >
              Import
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
