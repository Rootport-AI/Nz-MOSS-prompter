import { useEffect } from "react";
import {
  type AppSettings,
  DEFAULT_RECT_BODY_FONT_SIZE,
  DEFAULT_RECT_TITLE_FONT_SIZE,
  MAX_RECT_BODY_FONT_SIZE,
  MAX_RECT_TITLE_FONT_SIZE,
  MIN_RECT_BODY_FONT_SIZE,
  MIN_RECT_TITLE_FONT_SIZE,
  computeBaseHeaderHeight,
} from "../core/settings";
import { type ThemeMode, getItemTheme } from "../core/types";

interface SettingsModalProps {
  settings: AppSettings;
  onChangeSettings: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}

export function SettingsModal({
  settings,
  onChangeSettings,
  onClose,
}: SettingsModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const previewTheme = getItemTheme("character", settings.theme);
  const previewHeaderHeight = computeBaseHeaderHeight(
    settings.rectTitleFontSize,
  );
  const isDefaultFontSizes =
    settings.rectTitleFontSize === DEFAULT_RECT_TITLE_FONT_SIZE &&
    settings.rectBodyFontSize === DEFAULT_RECT_BODY_FONT_SIZE;

  const handleSelectTheme = (theme: ThemeMode) => {
    if (settings.theme !== theme) {
      onChangeSettings({ theme });
    }
  };

  const handleResetFontSizes = () => {
    onChangeSettings({
      rectTitleFontSize: DEFAULT_RECT_TITLE_FONT_SIZE,
      rectBodyFontSize: DEFAULT_RECT_BODY_FONT_SIZE,
    });
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal settings-modal">
        <div className="modal-header">
          <strong id="settings-modal-title">Settings</strong>
          <button
            type="button"
            className="fold"
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="modal-body settings-body">
          <section className="settings-section">
            <div className="settings-section-header">
              <span className="section-heading">Appearance / Theme</span>
            </div>
            <div
              className="segmented-control"
              role="group"
              aria-label="テーマ切り替え"
            >
              <button
                type="button"
                className={`segmented-btn${settings.theme === "light" ? " active" : ""}`}
                aria-pressed={settings.theme === "light"}
                onClick={() => handleSelectTheme("light")}
              >
                ☀ Light
              </button>
              <button
                type="button"
                className={`segmented-btn${settings.theme === "dark" ? " active" : ""}`}
                aria-pressed={settings.theme === "dark"}
                onClick={() => handleSelectTheme("dark")}
              >
                ☾ Dark
              </button>
            </div>
          </section>

          <div className="divider" />

          <section className="settings-section">
            <div className="settings-section-header">
              <span className="section-heading">Rectangle Font Sizes</span>
              <button
                type="button"
                className="mini-text-btn"
                onClick={handleResetFontSizes}
                disabled={isDefaultFontSizes}
                title={`タイトル ${DEFAULT_RECT_TITLE_FONT_SIZE}px / 本文 ${DEFAULT_RECT_BODY_FONT_SIZE}px にリセット`}
              >
                Reset Defaults
              </button>
            </div>

            <div className="settings-slider-group">
              <div className="settings-slider-row">
                <div className="settings-slider-label">
                  <label htmlFor="settings-title-font-size">
                    Title Font Size
                  </label>
                  <span className="settings-value-badge">
                    {settings.rectTitleFontSize}px
                  </span>
                </div>
                <input
                  id="settings-title-font-size"
                  className="settings-range"
                  type="range"
                  min={MIN_RECT_TITLE_FONT_SIZE}
                  max={MAX_RECT_TITLE_FONT_SIZE}
                  step={1}
                  value={settings.rectTitleFontSize}
                  onChange={(e) =>
                    onChangeSettings({
                      rectTitleFontSize: Number(e.target.value),
                    })
                  }
                />
                <div className="settings-range-scale">
                  <span>{MIN_RECT_TITLE_FONT_SIZE}px</span>
                  <span>{MAX_RECT_TITLE_FONT_SIZE}px</span>
                </div>
              </div>

              <div className="settings-slider-row">
                <div className="settings-slider-label">
                  <label htmlFor="settings-body-font-size">
                    Body Text Font Size
                  </label>
                  <span className="settings-value-badge">
                    {settings.rectBodyFontSize}px
                  </span>
                </div>
                <input
                  id="settings-body-font-size"
                  className="settings-range"
                  type="range"
                  min={MIN_RECT_BODY_FONT_SIZE}
                  max={MAX_RECT_BODY_FONT_SIZE}
                  step={1}
                  value={settings.rectBodyFontSize}
                  onChange={(e) =>
                    onChangeSettings({
                      rectBodyFontSize: Number(e.target.value),
                    })
                  }
                />
                <div className="settings-range-scale">
                  <span>{MIN_RECT_BODY_FONT_SIZE}px</span>
                  <span>{MAX_RECT_BODY_FONT_SIZE}px</span>
                </div>
              </div>
            </div>

            <div className="settings-preview-block">
              <div className="field-label">Preview (100% Canvas Scale)</div>
              <div className="settings-preview-stage">
                <div
                  className="settings-preview-rect"
                  style={{
                    background: previewTheme.bg,
                    borderColor: previewTheme.line,
                    color: previewTheme.ink,
                  }}
                >
                  <div
                    className="settings-preview-rect-head"
                    style={{
                      background: previewTheme.head,
                      height: `${previewHeaderHeight}px`,
                      fontSize: `${settings.rectTitleFontSize}px`,
                    }}
                  >
                    <span className="settings-preview-rect-title">
                      Character 1 ▾
                    </span>
                    <span
                      className="settings-preview-rect-gear"
                      aria-hidden="true"
                      style={{
                        borderColor: previewTheme.line,
                        color: previewTheme.ink,
                      }}
                    >
                      ⚙
                    </span>
                  </div>
                  <div
                    className="settings-preview-rect-body"
                    style={{
                      fontSize: `${settings.rectBodyFontSize}px`,
                    }}
                  >
                    A young woman in a red jacket.
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="button button-primary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
