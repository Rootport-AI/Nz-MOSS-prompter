import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_RECT_BODY_FONT_SIZE,
  DEFAULT_RECT_TITLE_FONT_SIZE,
  LEGACY_THEME_STORAGE_KEY,
  MAX_RECT_BODY_FONT_SIZE,
  MAX_RECT_TITLE_FONT_SIZE,
  MIN_RECT_BODY_FONT_SIZE,
  MIN_RECT_TITLE_FONT_SIZE,
  SETTINGS_STORAGE_KEY,
  type SettingsStorageLike,
  computeBaseHeaderHeight,
  computeRectHeaderMetrics,
  computeRectOverlayLayout,
  getSafeLocalStorage,
  loadAppSettings,
  sanitizeAppSettings,
  saveAppSettings,
} from "../src/core/settings";

function createMemoryStorage(
  initial: Record<string, string> = {},
): SettingsStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("settings", () => {
  it("returns default values (24px title & 24px body, light theme) when storage is empty or unavailable", () => {
    expect(DEFAULT_RECT_TITLE_FONT_SIZE).toBe(24);
    expect(DEFAULT_RECT_BODY_FONT_SIZE).toBe(24);
    expect(loadAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS);
    expect(loadAppSettings(undefined)).toEqual(DEFAULT_APP_SETTINGS);
    expect(loadAppSettings(createMemoryStorage())).toEqual({
      theme: "light",
      rectTitleFontSize: 24,
      rectBodyFontSize: 24,
    });
  });

  it("saves and reloads valid settings accurately", () => {
    const storage = createMemoryStorage();
    const ok = saveAppSettings(storage, {
      theme: "dark",
      rectTitleFontSize: 32,
      rectBodyFontSize: 40,
    });
    expect(ok).toBe(true);
    expect(loadAppSettings(storage)).toEqual({
      theme: "dark",
      rectTitleFontSize: 32,
      rectBodyFontSize: 40,
    });
  });

  it("clamps out-of-range font sizes and sanitizes invalid values", () => {
    expect(
      sanitizeAppSettings({
        theme: "dark",
        rectTitleFontSize: 2,
        rectBodyFontSize: 200,
      }),
    ).toEqual({
      theme: "dark",
      rectTitleFontSize: MIN_RECT_TITLE_FONT_SIZE,
      rectBodyFontSize: MAX_RECT_BODY_FONT_SIZE,
    });

    expect(
      sanitizeAppSettings({
        theme: "invalid",
        rectTitleFontSize: 999,
        rectBodyFontSize: -5,
      }),
    ).toEqual({
      theme: "light",
      rectTitleFontSize: MAX_RECT_TITLE_FONT_SIZE,
      rectBodyFontSize: MIN_RECT_BODY_FONT_SIZE,
    });

    expect(
      sanitizeAppSettings({
        theme: "light",
        rectTitleFontSize: Number.NaN,
        rectBodyFontSize: "24",
      }),
    ).toEqual(DEFAULT_APP_SETTINGS);

    expect(
      sanitizeAppSettings({
        theme: "dark",
        rectTitleFontSize: 25.6,
        rectBodyFontSize: 31.2,
      }),
    ).toEqual({
      theme: "dark",
      rectTitleFontSize: 26,
      rectBodyFontSize: 31,
    });
  });

  it("migrates theme from legacy storage key when new settings key is absent", () => {
    const darkLegacy = createMemoryStorage({
      [LEGACY_THEME_STORAGE_KEY]: "dark",
    });
    expect(loadAppSettings(darkLegacy)).toEqual({
      theme: "dark",
      rectTitleFontSize: 24,
      rectBodyFontSize: 24,
    });

    // Invalid legacy value safely falls back to light
    const invalidLegacy = createMemoryStorage({
      [LEGACY_THEME_STORAGE_KEY]: "sepia",
    });
    expect(loadAppSettings(invalidLegacy)).toEqual(DEFAULT_APP_SETTINGS);

    // New key takes precedence over legacy key
    const bothKeys = createMemoryStorage({
      [LEGACY_THEME_STORAGE_KEY]: "dark",
      [SETTINGS_STORAGE_KEY]: JSON.stringify({
        theme: "light",
        rectTitleFontSize: 20,
        rectBodyFontSize: 28,
      }),
    });
    expect(loadAppSettings(bothKeys)).toEqual({
      theme: "light",
      rectTitleFontSize: 20,
      rectBodyFontSize: 28,
    });
  });

  it("recovers safely from corrupted JSON, non-object JSON, and storage exceptions", () => {
    expect(
      loadAppSettings(
        createMemoryStorage({ [SETTINGS_STORAGE_KEY]: "{broken json" }),
      ),
    ).toEqual(DEFAULT_APP_SETTINGS);

    expect(
      loadAppSettings(createMemoryStorage({ [SETTINGS_STORAGE_KEY]: "null" })),
    ).toEqual(DEFAULT_APP_SETTINGS);

    expect(
      loadAppSettings(createMemoryStorage({ [SETTINGS_STORAGE_KEY]: "[]" })),
    ).toEqual(DEFAULT_APP_SETTINGS);

    const throwingStorage: SettingsStorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(loadAppSettings(throwingStorage)).toEqual(DEFAULT_APP_SETTINGS);
    expect(saveAppSettings(throwingStorage, DEFAULT_APP_SETTINGS)).toBe(false);
    expect(saveAppSettings(null, DEFAULT_APP_SETTINGS)).toBe(false);
  });

  it("computes rectangle header height and visibility cleanly across font sizes", () => {
    expect(computeBaseHeaderHeight(10)).toBe(24);
    expect(computeBaseHeaderHeight(24)).toBe(40);
    expect(computeBaseHeaderHeight(48)).toBe(79);

    // Normal box shows full header band
    expect(computeRectHeaderMetrics(400, 200, 24)).toEqual({
      showHeader: true,
      headerHeight: 40,
    });
    expect(computeRectHeaderMetrics(400, 200, 48)).toEqual({
      showHeader: true,
      headerHeight: 79,
    });

    // Tiny box hides header so ⚙ can escape outside cleanly
    expect(computeRectHeaderMetrics(32, 32, 24)).toEqual({
      showHeader: false,
      headerHeight: 0,
    });
  });

  it("unifies overlay & Konva header layout cleanly across zoom/font boundaries", () => {
    const gearSize = 24;

    // 1920x1088 Fit scenario: zoom = 0.43, title = 24px -> headerScreenH = 40 * 0.43 = 17.2 < 20
    // Must fall back to Konva title (showLabelSelect = false) and reserve room for inner ⚙
    const fhdFit = computeRectOverlayLayout(500, 300, 0.43, 24, gearSize);
    expect(fhdFit.showHeader).toBe(true);
    expect(fhdFit.headerScreenHeight).toBeCloseTo(17.2, 5);
    expect(fhdFit.isTiny).toBe(false);
    expect(fhdFit.showLabelSelect).toBe(false);
    expect(fhdFit.konvaTitleRightInset).toBe(Math.ceil(32 / 0.43) + 6);
    // Konva title starts at x=6 with width=(500 - inset), right edge must stay >= 6px left of ⚙
    const fhdTitleRightScreen = (6 + (500 - fhdFit.konvaTitleRightInset)) * 0.43;
    const fhdGearLeftScreen = 500 * 0.43 - gearSize - 2;
    expect(fhdTitleRightScreen).toBeLessThanOrEqual(fhdGearLeftScreen - 6);

    // Small font 12px @ 50% zoom -> headerScreenH = 24 * 0.5 = 12 < 20 -> Konva fallback
    const small50 = computeRectOverlayLayout(300, 200, 0.5, 12, gearSize);
    expect(small50.showHeader).toBe(true);
    expect(small50.headerScreenHeight).toBe(12);
    expect(small50.showLabelSelect).toBe(false);
    expect(small50.konvaTitleRightInset).toBe(Math.ceil(32 / 0.5) + 6);

    // Large font 48px @ 100% zoom on wide box -> HTML <select> shown with room & zero ⚙ overlap
    const largeWide = computeRectOverlayLayout(500, 240, 1.0, 48, gearSize);
    expect(largeWide.showHeader).toBe(true);
    expect(largeWide.headerHeight).toBe(79);
    expect(largeWide.headerScreenHeight).toBe(79);
    expect(largeWide.selectFontSize).toBe(48);
    expect(largeWide.showLabelSelect).toBe(true);
    expect(largeWide.selectWidth).toBe(Math.round(48 * 6.5 + 32));
    expect(largeWide.selectHeight).toBe(77);
    expect(3 + largeWide.selectWidth).toBeLessThanOrEqual(500 - gearSize - 2);

    // Large font 48px @ 100% zoom on narrower box (availSelectWidth = 186 < minSelectWidth = 216)
    const largeNarrow = computeRectOverlayLayout(220, 200, 1.0, 48, gearSize);
    expect(largeNarrow.showHeader).toBe(true);
    expect(largeNarrow.showLabelSelect).toBe(false);

    // Tiny screen box where ⚙ escapes outside -> Konva title uses compact 12px inset
    const tinyScreen = computeRectOverlayLayout(160, 80, 0.5, 24, gearSize);
    expect(tinyScreen.isTiny).toBe(true);
    expect(tinyScreen.showHeader).toBe(true);
    expect(tinyScreen.konvaTitleRightInset).toBe(12);
  });

  it("safely handles inaccessible or throwing window.localStorage via getSafeLocalStorage", () => {
    // In Vitest node environment window is undefined
    expect(getSafeLocalStorage()).toBeUndefined();

    // Simulate restricted environment where reading window.localStorage throws SecurityError
    const origWindow = (globalThis as Record<string, unknown>).window;
    try {
      const restrictedWindow = {};
      Object.defineProperty(restrictedWindow, "localStorage", {
        get() {
          throw new Error("SecurityError: storage disabled");
        },
        configurable: true,
      });
      (globalThis as Record<string, unknown>).window = restrictedWindow;
      expect(getSafeLocalStorage()).toBeUndefined();
    } finally {
      if (origWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = origWindow;
      }
    }
  });
});
