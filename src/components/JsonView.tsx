import type { ValidationIssue } from "../core/types";

interface JsonViewProps {
  prettyJson: string;
  copyCompact: boolean;
  issues: ValidationIssue[];
  copyFeedback: string | null;
  onChangeCopyCompact: (compact: boolean) => void;
  onCopy: () => void;
  onExport: () => void;
}

export function JsonView({
  prettyJson,
  copyCompact,
  issues,
  copyFeedback,
  onChangeCopyCompact,
  onCopy,
  onExport,
}: JsonViewProps) {
  return (
    <div className="json-view">
      <div className="json-header">
        <div className="json-header-left">
          <strong>Live JSON (Model-Facing)</strong>
          {issues.length === 0 ? (
            <span className="pill pill-ok">Valid</span>
          ) : (
            <span className="pill pill-warn">{issues.length} 件の警告</span>
          )}
        </div>
        <div className="json-header-actions">
          <label className="toggle-label" title="コピー時のJSON形式を切り替え">
            <input
              type="checkbox"
              checked={copyCompact}
              onChange={(e) => onChangeCopyCompact(e.target.checked)}
            />
            1行コンパクトでコピー
          </label>
          <button type="button" className="button" onClick={onExport}>
            Export
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={onCopy}
          >
            {copyFeedback ?? "Copy"}
          </button>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="json-issues">
          {issues.map((issue, idx) => (
            <div key={`${issue.path}-${idx}`} className="help-error">
              • [{issue.path}] {issue.message}
            </div>
          ))}
        </div>
      )}

      <pre className="json-data">{prettyJson}</pre>
    </div>
  );
}
