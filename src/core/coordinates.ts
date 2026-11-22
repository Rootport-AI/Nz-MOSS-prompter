import {
  type BBoxYxyx,
  type CanvasRect,
  type EditorItem,
  MAX_CANVAS_SIZE,
  MIN_CANVAS_SIZE,
} from "./types";

export function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isValidDimension(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= MIN_CANVAS_SIZE &&
    value <= MAX_CANVAS_SIZE &&
    value % 16 === 0
  );
}

/**
 * Snap a canvas edge to a positive multiple of 16 within [MIN_CANVAS_SIZE, MAX_CANVAS_SIZE].
 */
export function snapDimension(value: number): number {
  if (!Number.isFinite(value)) return MIN_CANVAS_SIZE;
  const snapped = Math.round(value / 16) * 16;
  return clamp(snapped, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
}

/**
 * Convert MOSS-Image center-origin yxyx bbox to Konva top-left rectangle.
 * Pure rendering boundary conversion; does not mutate the source bbox.
 */
export function yxyxToCanvasRect(
  bbox: BBoxYxyx,
  canvasWidth: number,
  canvasHeight: number,
): CanvasRect {
  const [yMin, xMin, yMax, xMax] = bbox;
  const halfW = canvasWidth / 2;
  const halfH = canvasHeight / 2;
  return {
    x: normalizeZero(xMin + halfW),
    y: normalizeZero(yMin + halfH),
    width: normalizeZero(xMax - xMin),
    height: normalizeZero(yMax - yMin),
  };
}

/**
 * Translate a bbox by integer pixel delta (dx, dy) while strictly preserving width and height.
 * Clamps inside the canvas only when the box fits within the canvas dimension,
 * avoiding coordinate inversion/warping when the canvas was shrunk below the box size.
 */
export function translateBBox(
  bbox: BBoxYxyx,
  dx: number,
  dy: number,
  canvasWidth: number,
  canvasHeight: number,
): BBoxYxyx {
  const [yMin, xMin, yMax, xMax] = bbox;
  const halfW = Math.floor(canvasWidth / 2);
  const halfH = Math.floor(canvasHeight / 2);
  const boxW = xMax - xMin;
  const boxH = yMax - yMin;

  let nextDx = Math.round(dx);
  let nextDy = Math.round(dy);

  if (boxW <= canvasWidth) {
    const minDx = -halfW - xMin;
    const maxDx = halfW - xMax;
    nextDx = clamp(nextDx, minDx, maxDx);
  }
  if (boxH <= canvasHeight) {
    const minDy = -halfH - yMin;
    const maxDy = halfH - yMax;
    nextDy = clamp(nextDy, minDy, maxDy);
  }

  return [
    normalizeZero(yMin + nextDy),
    normalizeZero(xMin + nextDx),
    normalizeZero(yMax + nextDy),
    normalizeZero(xMax + nextDx),
  ];
}

/**
 * Convert a resized Konva top-left rectangle back to integer center-origin yxyx bbox.
 * Guarantees at least 1px positive width/height and clamps strictly inside [-W/2, W/2], [-H/2, H/2].
 */
export function resizeBBoxFromCanvasRect(
  rect: CanvasRect,
  canvasWidth: number,
  canvasHeight: number,
): BBoxYxyx {
  const halfW = Math.floor(canvasWidth / 2);
  const halfH = Math.floor(canvasHeight / 2);

  const rawXMin = Math.round(rect.x) - halfW;
  const rawYMin = Math.round(rect.y) - halfH;
  const rawXMax = Math.round(rect.x + rect.width) - halfW;
  const rawYMax = Math.round(rect.y + rect.height) - halfH;

  const xMin = clamp(rawXMin, -halfW, halfW - 1);
  const yMin = clamp(rawYMin, -halfH, halfH - 1);
  const xMax = clamp(rawXMax, xMin + 1, halfW);
  const yMax = clamp(rawYMax, yMin + 1, halfH);

  return [
    normalizeZero(yMin),
    normalizeZero(xMin),
    normalizeZero(yMax),
    normalizeZero(xMax),
  ];
}

export function isBBoxValid(
  bbox: BBoxYxyx,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  const [yMin, xMin, yMax, xMax] = bbox;
  if (!bbox.every((v) => Number.isSafeInteger(v))) return false;
  const halfW = canvasWidth / 2;
  const halfH = canvasHeight / 2;
  return (
    yMin < yMax &&
    xMin < xMax &&
    yMin >= -halfH &&
    yMax <= halfH &&
    xMin >= -halfW &&
    xMax <= halfW
  );
}

/**
 * Compute the smallest multiple-of-16 canvas dimensions that enclose all items
 * under symmetric center-origin coordinates ([-W/2, W/2], [-H/2, H/2]).
 */
export function computeMinEnclosingCanvasSize(
  items: readonly Pick<EditorItem, "bbox">[],
): { width: number; height: number } {
  let maxAbsX = 0;
  let maxAbsY = 0;
  for (const item of items) {
    const [yMin, xMin, yMax, xMax] = item.bbox;
    maxAbsY = Math.max(maxAbsY, Math.abs(yMin), Math.abs(yMax));
    maxAbsX = Math.max(maxAbsX, Math.abs(xMin), Math.abs(xMax));
  }
  const width = clamp(
    Math.max(MIN_CANVAS_SIZE, Math.ceil(maxAbsX / 8) * 16),
    MIN_CANVAS_SIZE,
    MAX_CANVAS_SIZE,
  );
  const height = clamp(
    Math.max(MIN_CANVAS_SIZE, Math.ceil(maxAbsY / 8) * 16),
    MIN_CANVAS_SIZE,
    MAX_CANVAS_SIZE,
  );
  return { width, height };
}

export function createDefaultBBox(
  canvasWidth: number,
  canvasHeight: number,
  offsetIndex = 0,
): BBoxYxyx {
  const boxW = Math.min(260, Math.max(32, Math.round(canvasWidth * 0.25)));
  const boxH = Math.min(190, Math.max(32, Math.round(canvasHeight * 0.2)));
  const shift = (offsetIndex % 5) * 20;
  const base: BBoxYxyx = [
    normalizeZero(-Math.floor(boxH / 2)),
    normalizeZero(-Math.floor(boxW / 2)),
    normalizeZero(Math.ceil(boxH / 2)),
    normalizeZero(Math.ceil(boxW / 2)),
  ];
  return translateBBox(base, shift, shift, canvasWidth, canvasHeight);
}
