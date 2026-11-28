import { clamp } from "./coordinates";
import type { ThemeMode } from "./types";

export const SETTINGS_STORAGE_KEY = "nz-moss-prompter/settings";
export const LEGACY_THEME_STORAGE_KEY = "nz-moss-prompter/theme";

export const MIN_RECT_TITLE_FONT_SIZE = 10;
export const MAX_RECT_TITLE_FONT_SIZE = 48;
export const DEFAULT_RECT_TITLE_FONT_SIZE = 24;

export const MIN_RECT_BODY_FONT_SIZE = 10;
export const MAX_RECT_BODY_FONT_SIZE = 64;
export const DEFAULT_RECT_BODY_FONT_SIZE = 24;

export interface AppSettings {
  theme: ThemeMode;
  rectTitleFontSize: number;
  rectBodyFontSize: number;
}

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = {
  theme: "light",
  rectTitleFontSize: DEFAULT_RECT_TITLE_FONT_SIZE,
  rectBodyFontSize: DEFAULT_RECT_BODY_FONT_SIZE,
};

export interface SettingsStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Safely access window.localStorage in environments where the getter itself may throw
 * (e.g., restricted sandboxes, disabled storage, or SSR/Node environments).
 */
export function getSafeLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function sanitizeTheme(value: unknown, fallback: ThemeMode): ThemeMode {
  return value === "dark" || value === "light" ? value : fallback;
}

function sanitizeFontSize(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return clamp(Math.round(value), min, max);
}

export function sanitizeAppSettings(raw: unknown): AppSettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_APP_SETTINGS };
  }
  const obj = raw as Record<string, unknown>;
  return {
    theme: sanitizeTheme(obj.theme, DEFAULT_APP_SETTINGS.theme),
    rectTitleFontSize: sanitizeFontSize(
      obj.rectTitleFontSize,
      MIN_RECT_TITLE_FONT_SIZE,
      MAX_RECT_TITLE_FONT_SIZE,
      DEFAULT_RECT_TITLE_FONT_SIZE,
    ),
    rectBodyFontSize: sanitizeFontSize(
      obj.rectBodyFontSize,
      MIN_RECT_BODY_FONT_SIZE,
      MAX_RECT_BODY_FONT_SIZE,
      DEFAULT_RECT_BODY_FONT_SIZE,
    ),
  };
}

/**
 * Load application settings from storage.
 * On first load when SETTINGS_STORAGE_KEY is absent, migrates theme from LEGACY_THEME_STORAGE_KEY.
 * Safely falls back / clamps on corrupted JSON, invalid types, out-of-range numbers, or storage exceptions.
 */
export function loadAppSettings(
  storage: SettingsStorageLike | null | undefined,
): AppSettings {
  if (!storage) return { ...DEFAULT_APP_SETTINGS };

  let rawSettings: string | null = null;
  try {
    rawSettings = storage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }

  if (rawSettings !== null) {
    try {
      const parsed: unknown = JSON.parse(rawSettings);
      return sanitizeAppSettings(parsed);
    } catch {
      return { ...DEFAULT_APP_SETTINGS };
    }
  }

  // Migrate theme from legacy storage key when new key has never been written
  try {
    const legacyTheme = storage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacyTheme === "dark" || legacyTheme === "light") {
      return {
        ...DEFAULT_APP_SETTINGS,
        theme: legacyTheme,
      };
    }
  } catch {
    // Ignore storage access errors
  }

  return { ...DEFAULT_APP_SETTINGS };
}

export function saveAppSettings(
  storage: SettingsStorageLike | null | undefined,
  settings: AppSettings,
): boolean {
  if (!storage) return false;
  try {
    const sanitized = sanitizeAppSettings(settings);
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute ideal rectangle header band height in canvas pixels for a given title font size.
 */
export function computeBaseHeaderHeight(rectTitleFontSize: number): number {
  return Math.max(24, Math.round(rectTitleFontSize * 1.65));
}

/**
 * Compute whether to display a rectangle's header band and its actual height in canvas pixels.
 */
export function computeRectHeaderMetrics(
  rectWidth: number,
  rectHeight: number,
  rectTitleFontSize: number,
): { showHeader: boolean; headerHeight: number } {
  const baseHeaderH = computeBaseHeaderHeight(rectTitleFontSize);
  const minHeaderHeight = Math.max(28, Math.round(baseHeaderH * 1.25));
  const minHeaderWidth = Math.max(48, Math.round(rectTitleFontSize * 2.5));
  const showHeader =
    rectHeight >= minHeaderHeight && rectWidth >= minHeaderWidth;
  const headerHeight = showHeader
    ? Math.min(baseHeaderH, rectHeight * 0.65)
    : 0;
  return { showHeader, headerHeight };
}

export interface RectOverlayLayout {
  showHeader: boolean;
  headerHeight: number;
  headerScreenHeight: number;
  isTiny: boolean;
  showLabelSelect: boolean;
  selectFontSize: number;
  selectWidth: number;
  selectHeight: number;
  konvaTitleRightInset: number;
}

/**
 * Single-source-of-truth layout computation for both Konva header text rendering
 * and HTML overlay controls (<select> label dropdown and ⚙ button).
 */
export function computeRectOverlayLayout(
  rectWidth: number,
  rectHeight: number,
  zoom: number,
  rectTitleFontSize: number,
  gearSize = 24,
): RectOverlayLayout {
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const { showHeader, headerHeight } = computeRectHeaderMetrics(
    rectWidth,
    rectHeight,
    rectTitleFontSize,
  );

  const screenW = rectWidth * safeZoom;
  const screenH = rectHeight * safeZoom;
  const isTiny = screenW < 48 || screenH < 48;
  const headerScreenHeight = headerHeight * safeZoom;

  const selectFontSize = Math.max(10, Math.round(rectTitleFontSize * safeZoom));
  const availSelectWidth = screenW - gearSize - 10;
  const minSelectWidth = Math.max(64, Math.round(selectFontSize * 4 + 24));
  const showLabelSelect =
    showHeader &&
    headerScreenHeight >= 20 &&
    availSelectWidth >= minSelectWidth;

  const selectWidth = Math.max(
    0,
    Math.min(
      Math.max(88, Math.round(selectFontSize * 6.5 + 32)),
      availSelectWidth,
    ),
  );
  const roundedHeaderScreenH = Math.round(headerScreenHeight);
  const selectHeight = Math.max(
    18,
    Math.min(roundedHeaderScreenH - 2, roundedHeaderScreenH),
  );

  // Reserve room for inner ⚙ button in world coordinates so Konva title never overlaps it when zoom < 1
  const konvaTitleRightInset = !isTiny
    ? Math.ceil((gearSize + 8) / safeZoom) + 6
    : 12;

  return {
    showHeader,
    headerHeight,
    headerScreenHeight,
    isTiny,
    showLabelSelect,
    selectFontSize,
    selectWidth,
    selectHeight,
    konvaTitleRightInset,
  };
}
