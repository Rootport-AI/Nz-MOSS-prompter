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

export interface EnclosingCanvasResult {
  /** Required width (multiple of 16, unclamped). */
  requiredWidth: number;
  /** Required height (multiple of 16, unclamped). */
  requiredHeight: number;
  /** Clamped width within [MIN_CANVAS_SIZE, MAX_CANVAS_SIZE]. */
  width: number;
  /** Clamped height within [MIN_CANVAS_SIZE, MAX_CANVAS_SIZE]. */
  height: number;
  /** True when either required dimension exceeds MAX_CANVAS_SIZE (8192). */
  exceedsMax: boolean;
}

/**
 * Compute the smallest multiple-of-16 canvas dimensions that enclose all items
 * under symmetric center-origin coordinates ([-W/2, W/2], [-H/2, H/2]).
 */
export function computeMinEnclosingCanvasSize(
  items: readonly Pick<EditorItem, "bbox">[],
): EnclosingCanvasResult {
  let maxAbsX = 0;
  let maxAbsY = 0;
  for (const item of items) {
    const [yMin, xMin, yMax, xMax] = item.bbox;
    maxAbsY = Math.max(maxAbsY, Math.abs(yMin), Math.abs(yMax));
    maxAbsX = Math.max(maxAbsX, Math.abs(xMin), Math.abs(xMax));
  }
  const requiredWidth = Math.max(MIN_CANVAS_SIZE, Math.ceil(maxAbsX / 8) * 16);
  const requiredHeight = Math.max(MIN_CANVAS_SIZE, Math.ceil(maxAbsY / 8) * 16);
  const exceedsMax =
    requiredWidth > MAX_CANVAS_SIZE || requiredHeight > MAX_CANVAS_SIZE;
  return {
    requiredWidth,
    requiredHeight,
    width: clamp(requiredWidth, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE),
    height: clamp(requiredHeight, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE),
    exceedsMax,
  };
}

export function createDefaultBBox(
  canvasWidth: number,
  canvasHeight: number,
  offsetIndex = 0,
): BBoxYxyx {
  const boxW = Math.min(
    canvasWidth,
    Math.min(260, Math.max(32, Math.round(canvasWidth * 0.25))),
  );
  const boxH = Math.min(
    canvasHeight,
    Math.min(190, Math.max(32, Math.round(canvasHeight * 0.2))),
  );
  const shift = (offsetIndex % 5) * 20;
  const base: BBoxYxyx = [
    normalizeZero(-Math.floor(boxH / 2)),
    normalizeZero(-Math.floor(boxW / 2)),
    normalizeZero(Math.ceil(boxH / 2)),
    normalizeZero(Math.ceil(boxW / 2)),
  ];
  return translateBBox(base, shift, shift, canvasWidth, canvasHeight);
}

/**
 * Compute zoom and pan offset to fit the full canvas inside a viewport.
 * Allows zoom below 25% when needed for large canvases (e.g. 4096px+) or narrow viewports.
 */
export function computeFitViewportTransform(
  viewportWidth: number,
  viewportHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  maxZoom = 3.0,
  padding = 44,
): { zoom: number; pan: { x: number; y: number } } {
  const safeVpW = Math.max(1, viewportWidth);
  const safeVpH = Math.max(1, viewportHeight);
  const availW = Math.max(16, safeVpW - padding * 2);
  const availH = Math.max(16, safeVpH - padding * 2);
  const rawZoom = Math.min(availW / canvasWidth, availH / canvasHeight);
  const zoom = clamp(rawZoom, 0.01, maxZoom);
  const pan = {
    x: Math.round((safeVpW - canvasWidth * zoom) / 2),
    y: Math.round((safeVpH - canvasHeight * zoom) / 2),
  };
  return { zoom, pan };
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Size2D {
  width: number;
  height: number;
}

export interface AbsoluteBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/**
 * Clamp Konva Rect drag position (screen absolute coordinates) so the rectangle
 * stays within the canvas area during dragging.
 * Axes where the rectangle exceeds the canvas size (e.g., after shrinking canvas)
 * are passed through unclamped to avoid coordinate inversion or warping.
 */
export function clampDragAbsolutePos(
  absPos: Point2D,
  rectSize: Size2D,
  canvasSize: Size2D,
  zoom: number,
  pan: Point2D,
): Point2D {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return { x: absPos.x, y: absPos.y };
  }

  let nextX = absPos.x;
  let nextY = absPos.y;

  if (rectSize.width <= canvasSize.width) {
    const minX = pan.x;
    const maxX = pan.x + (canvasSize.width - rectSize.width) * zoom;
    nextX = clamp(absPos.x, minX, maxX);
  }

  if (rectSize.height <= canvasSize.height) {
    const minY = pan.y;
    const maxY = pan.y + (canvasSize.height - rectSize.height) * zoom;
    nextY = clamp(absPos.y, minY, maxY);
  }

  return {
    x: normalizeZero(nextX),
    y: normalizeZero(nextY),
  };
}

/**
 * Clamp Konva Transformer bounding box (screen absolute coordinates) smoothly
 * against the canvas edges during resizing.
 * If oldBox already protrudes outside the canvas (e.g., after shrinking canvas),
 * expands the outer boundary to oldBox's current edges so the user cannot push it
 * further outside yet can still resize it back inward.
 */
export function clampTransformAbsoluteBox(
  oldBox: AbsoluteBox,
  newBox: AbsoluteBox,
  canvasSize: Size2D,
  zoom: number,
  pan: Point2D,
): AbsoluteBox {
  if (
    !Number.isFinite(zoom) ||
    zoom <= 0 ||
    !Number.isFinite(newBox.x) ||
    !Number.isFinite(newBox.y) ||
    !Number.isFinite(newBox.width) ||
    !Number.isFinite(newBox.height)
  ) {
    return oldBox;
  }

  const EPS = 1e-5;
  const minScreen = Math.max(1 * zoom, 1);
  if (newBox.width < minScreen - EPS || newBox.height < minScreen - EPS) {
    return oldBox;
  }

  const canvasLeft = pan.x;
  const canvasTop = pan.y;
  const canvasRight = pan.x + canvasSize.width * zoom;
  const canvasBottom = pan.y + canvasSize.height * zoom;

  const oldRight = oldBox.x + oldBox.width;
  const oldBottom = oldBox.y + oldBox.height;

  const minLeft = Math.min(canvasLeft, oldBox.x);
  const maxRight = Math.max(canvasRight, oldRight);
  const minTop = Math.min(canvasTop, oldBox.y);
  const maxBottom = Math.max(canvasBottom, oldBottom);

  const clampedLeft = clamp(newBox.x, minLeft, maxRight);
  const clampedRight = clamp(newBox.x + newBox.width, minLeft, maxRight);
  const clampedTop = clamp(newBox.y, minTop, maxBottom);
  const clampedBottom = clamp(newBox.y + newBox.height, minTop, maxBottom);

  const clampedWidth = clampedRight - clampedLeft;
  const clampedHeight = clampedBottom - clampedTop;

  if (clampedWidth < minScreen - EPS || clampedHeight < minScreen - EPS) {
    return oldBox;
  }

  return {
    x: normalizeZero(clampedLeft),
    y: normalizeZero(clampedTop),
    width: normalizeZero(clampedWidth),
    height: normalizeZero(clampedHeight),
    rotation: newBox.rotation,
  };
}
