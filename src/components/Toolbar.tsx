import type { ItemLabel, ThemeMode } from "../core/types";

interface ToolbarProps {
  width: number;
  height: number;
  theme: ThemeMode;
  onAddItem: (label: ItemLabel) => void;
  onOpenImport: () => void;
  onToggleTheme: () => void;
}

export function Toolbar({
  width,
  height,
  theme,
  onAddItem,
  onOpenImport,
  onToggleTheme,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-icon" aria-hidden="true">
          ▣
        </span>
        Nz-MOSS-prompter
      </div>

      <div className="toolbar-group">
        <button
          type="button"
          className="button"
          onClick={() => onAddItem("object")}
          title="object 矩形を追加"
        >
          ＋ Object
        </button>
        <button
          type="button"
          className="button"
          onClick={() => onAddItem("character")}
          title="character 矩形を追加"
        >
          ＋ Character
        </button>
        <button
          type="button"
          className="button"
          onClick={() => onAddItem("text")}
          title="text 矩形を追加"
        >
          ＋ Text
        </button>
      </div>

      <div className="toolbar-actions">
        <button
          type="button"
          className="button"
          onClick={onOpenImport}
          title="モデルJSON / プロジェクトJSON / 公式Draft JSONをインポート"
        >
          Import
        </button>

        <button
          type="button"
          className="button"
          onClick={onToggleTheme}
          title={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
          aria-label={theme === "dark" ? "ライトモードに切り替え" : "ダークモードに切り替え"}
        >
          {theme === "dark" ? "☀ Light" : "☾ Dark"}
        </button>

        <span
          className="status"
          title="キャンバス解像度（出力JSONには含まれません）"
        >
          {width} × {height}
        </span>
      </div>
    </header>
  );
}
