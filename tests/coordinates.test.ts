import { describe, expect, it } from "vitest";
import {
  type AbsoluteBox,
  clampDragAbsolutePos,
  clampTransformAbsoluteBox,
  computeFitViewportTransform,
  computeMinEnclosingCanvasSize,
  createDefaultBBox,
  isBBoxValid,
  isValidDimension,
  resizeBBoxFromCanvasRect,
  snapDimension,
  translateBBox,
  yxyxToCanvasRect,
} from "../src/core/coordinates";
import { type BBoxYxyx, CANVAS_PRESETS } from "../src/core/types";

describe("coordinates", () => {
  it("validates and snaps dimensions to multiples of 16", () => {
    expect(isValidDimension(1280)).toBe(true);
    expect(isValidDimension(16)).toBe(true);
    expect(isValidDimension(8192)).toBe(true);
    expect(isValidDimension(15)).toBe(false);
    expect(isValidDimension(1000)).toBe(false);
    expect(isValidDimension(0)).toBe(false);
    expect(isValidDimension(-16)).toBe(false);
    expect(isValidDimension(8208)).toBe(false);

    expect(snapDimension(1275)).toBe(1280);
    expect(snapDimension(1)).toBe(16);
    expect(snapDimension(99999)).toBe(8192);
    expect(snapDimension(Number.NaN)).toBe(16);
  });

  it("round-trips yxyx <-> Konva canvas rect accurately across resolutions", () => {
    const cases: Array<{ w: number; h: number; bbox: BBoxYxyx }> = [
      { w: 1280, h: 768, bbox: [-334, -315, -205, 315] },
      { w: 1024, h: 1024, bbox: [-512, -512, 512, 512] },
      { w: 1536, h: 1024, bbox: [-288, -592, 352, 32] },
      { w: 512, h: 512, bbox: [0, 0, 1, 1] },
    ];

    for (const { w, h, bbox } of cases) {
      const rect = yxyxToCanvasRect(bbox, w, h);
      const back = resizeBBoxFromCanvasRect(rect, w, h);
      expect(back).toEqual(bbox);
      expect(isBBoxValid(back, w, h)).toBe(true);
    }
  });

  it("keeps width and height strictly invariant during translation even with fractional deltas", () => {
    const start: BBoxYxyx = [-100, -200, 50, 100];
    const moved = translateBBox(start, 33.4, -17.6, 1280, 768);
    expect(moved[3] - moved[1]).toBe(start[3] - start[1]);
    expect(moved[2] - moved[0]).toBe(start[2] - start[0]);
    expect(moved).toEqual([-118, -167, 32, 133]);
  });

  it("clamps translation inside canvas when box fits, and avoids inversion when box exceeds canvas", () => {
    // Box fits inside 512x512 -> clamped to edge
    const clamped = translateBBox([-100, -100, 100, 100], 500, -500, 512, 512);
    expect(clamped).toEqual([-256, 56, -56, 256]);
    expect(isBBoxValid(clamped, 512, 512)).toBe(true);

    // Box wider than 512 canvas (width = 600) -> does NOT invert or warp
    const oversized: BBoxYxyx = [-100, -300, 100, 300];
    const shifted = translateBBox(oversized, 20, 10, 512, 512);
    expect(shifted).toEqual([-90, -280, 110, 320]);
    expect(shifted[3] - shifted[1]).toBe(600);
  });

  it("never produces out-of-bounds bbox when resizing near right/bottom canvas edges", () => {
    // Right/bottom edge at x = 1280, y = 768 with 0 width/height
    const atCorner = resizeBBoxFromCanvasRect(
      { x: 1280, y: 768, width: 0, height: 0 },
      1280,
      768,
    );
    expect(atCorner).toEqual([383, 639, 384, 640]);
    expect(isBBoxValid(atCorner, 1280, 768)).toBe(true);

    // Avoids -0
    const zeroEdge = resizeBBoxFromCanvasRect(
      { x: 640, y: 384, width: 10, height: 10 },
      1280,
      768,
    );
    expect(Object.is(zeroEdge[0], -0)).toBe(false);
    expect(Object.is(zeroEdge[1], -0)).toBe(false);
    expect(zeroEdge).toEqual([0, 0, 10, 10]);
  });

  it("computes symmetric minimum enclosing canvas size (multiple of 16) and detects >8192 overflow", () => {
    // x_min = -650, x_max = 100 -> needs 2 * 650 = 1300 -> ceil to 16 = 1312
    const min = computeMinEnclosingCanvasSize([
      { bbox: [-200, -650, 100, 100] },
    ]);
    expect(min.width).toBe(1312);
    expect(min.height).toBe(400);
    expect(min.exceedsMax).toBe(false);
    expect(isBBoxValid([-200, -650, 100, 100], min.width, min.height)).toBe(true);

    // P2-3: X in [-5000, 5000] requires 10000 > 8192
    const overflowX = computeMinEnclosingCanvasSize([
      { bbox: [-200, -5000, 200, 5000] },
    ]);
    expect(overflowX.exceedsMax).toBe(true);
    expect(overflowX.requiredWidth).toBe(10000);
    expect(overflowX.requiredHeight).toBe(400);

    // P2-3: Only Y exceeds 8192
    const overflowY = computeMinEnclosingCanvasSize([
      { bbox: [-4500, -100, 100, 100] },
    ]);
    expect(overflowY.exceedsMax).toBe(true);
    expect(overflowY.requiredWidth).toBe(208);
    expect(overflowY.requiredHeight).toBe(9008);
  });

  it("creates valid default bboxes even on tiny canvases (16x16, 16x32, 32x16)", () => {
    const sizes: Array<[number, number]> = [
      [16, 16],
      [16, 32],
      [32, 16],
    ];
    for (const [w, h] of sizes) {
      for (let slot = 0; slot < 5; slot += 1) {
        const bbox = createDefaultBBox(w, h, slot);
        expect(isBBoxValid(bbox, w, h)).toBe(true);
      }
    }
  });

  it("fits 4096px+ canvases below 25% zoom so the full canvas stays visible", () => {
    const fit4k = computeFitViewportTransform(900, 600, 4096, 4096);
    expect(fit4k.zoom).toBeLessThan(0.25);
    expect(4096 * fit4k.zoom).toBeLessThanOrEqual(900);
    expect(4096 * fit4k.zoom).toBeLessThanOrEqual(600);

    const fit8k = computeFitViewportTransform(800, 500, 8192, 4096);
    expect(fit8k.zoom).toBeLessThan(0.1);
    expect(8192 * fit8k.zoom).toBeLessThanOrEqual(800);
    expect(4096 * fit8k.zoom).toBeLessThanOrEqual(500);
  });

  it("includes 1920 × 1088 preset and keeps all canvas presets valid multiples of 16", () => {
    const fhd = CANVAS_PRESETS.find((p) => p.width === 1920 && p.height === 1088);
    expect(fhd).toEqual({
      label: "1920 × 1088 (16:9)",
      width: 1920,
      height: 1088,
    });
    for (const preset of CANVAS_PRESETS) {
      expect(isValidDimension(preset.width)).toBe(true);
      expect(isValidDimension(preset.height)).toBe(true);
    }
  });

  it("clamps dragged rectangle absolute position inside canvas under zoom and pan", () => {
    const canvas = { width: 1280, height: 768 };
    const rect = { width: 200, height: 100 };
    const zoom = 0.5;
    const pan = { x: 40, y: 20 };
    // Allowed abs X: [40, 40 + (1280 - 200) * 0.5] = [40, 580]
    // Allowed abs Y: [20, 20 + (768 - 100) * 0.5] = [20, 354]

    // Inside bounds -> unchanged
    expect(
      clampDragAbsolutePos({ x: 200, y: 150 }, rect, canvas, zoom, pan),
    ).toEqual({ x: 200, y: 150 });

    // Beyond top-left -> clamped to pan
    expect(
      clampDragAbsolutePos({ x: -50, y: -10 }, rect, canvas, zoom, pan),
    ).toEqual({ x: 40, y: 20 });

    // Beyond bottom-right -> clamped to exact far edge
    expect(
      clampDragAbsolutePos({ x: 999, y: 888 }, rect, canvas, zoom, pan),
    ).toEqual({ x: 580, y: 354 });

    // Negative pan & zoom > 1
    const negPan = { x: -120, y: -80 };
    const zoomIn = 1.5;
    // Allowed abs X: [-120, -120 + (1280 - 200) * 1.5] = [-120, 1500]
    // Allowed abs Y: [-80, -80 + (768 - 100) * 1.5] = [-80, 922]
    expect(
      clampDragAbsolutePos({ x: -300, y: 1200 }, rect, canvas, zoomIn, negPan),
    ).toEqual({ x: -120, y: 922 });

    // Exact full-canvas rect pins to pan
    expect(
      clampDragAbsolutePos({ x: 100, y: 100 }, canvas, canvas, zoom, pan),
    ).toEqual({ x: 40, y: 20 });
  });

  it("does not clamp or invert oversized axes in clampDragAbsolutePos", () => {
    const canvas = { width: 512, height: 512 };
    const zoom = 1;
    const pan = { x: 10, y: 20 };

    // Width exceeds canvas (600 > 512), height fits (200 <= 512)
    expect(
      clampDragAbsolutePos(
        { x: -120, y: 999 },
        { width: 600, height: 200 },
        canvas,
        zoom,
        pan,
      ),
    ).toEqual({ x: -120, y: 20 + 312 });

    // Height exceeds canvas (700 > 512), width fits (100 <= 512)
    expect(
      clampDragAbsolutePos(
        { x: -120, y: -300 },
        { width: 100, height: 700 },
        canvas,
        zoom,
        pan,
      ),
    ).toEqual({ x: 10, y: -300 });

    // Both axes exceed canvas -> pass through untouched
    expect(
      clampDragAbsolutePos(
        { x: -80, y: 500 },
        { width: 800, height: 800 },
        canvas,
        zoom,
        pan,
      ),
    ).toEqual({ x: -80, y: 500 });
  });

  it("smoothly clamps Transformer resize boxes to canvas edges under zoom and pan", () => {
    const canvas = { width: 1000, height: 600 };
    const zoom = 0.5;
    const pan = { x: 50, y: 30 };
    // Canvas abs bounds: X in [50, 550], Y in [30, 330]
    const oldBox: AbsoluteBox = {
      x: 150,
      y: 100,
      width: 200,
      height: 100,
      rotation: 0,
    };

    // Normal resize inside canvas
    const inside: AbsoluteBox = {
      x: 100,
      y: 80,
      width: 250,
      height: 120,
      rotation: 0,
    };
    expect(
      clampTransformAbsoluteBox(oldBox, inside, canvas, zoom, pan),
    ).toEqual(inside);

    // Fast drag past left & top edges -> sticks cleanly to (50, 30) while keeping right=350, bottom=200
    const pastTopLeft: AbsoluteBox = {
      x: -200,
      y: -150,
      width: 550,
      height: 350,
      rotation: 0,
    };
    expect(
      clampTransformAbsoluteBox(oldBox, pastTopLeft, canvas, zoom, pan),
    ).toEqual({
      x: 50,
      y: 30,
      width: 300,
      height: 170,
      rotation: 0,
    });

    // Fast drag past right & bottom edges -> sticks cleanly to right=550, bottom=330
    const pastBottomRight: AbsoluteBox = {
      x: 150,
      y: 100,
      width: 900,
      height: 700,
      rotation: 0,
    };
    expect(
      clampTransformAbsoluteBox(oldBox, pastBottomRight, canvas, zoom, pan),
    ).toEqual({
      x: 150,
      y: 100,
      width: 400,
      height: 230,
      rotation: 0,
    });
  });

  it("enforces minimum screen size and handles already-protruding boxes safely during resize", () => {
    const canvas = { width: 512, height: 512 };
    const pan = { x: 0, y: 0 };

    // Minimum size with zoom = 2 -> minScreen = Math.max(2, 1) = 2
    const oldNormal: AbsoluteBox = {
      x: 100,
      y: 100,
      width: 80,
      height: 80,
      rotation: 0,
    };
    expect(
      clampTransformAbsoluteBox(
        oldNormal,
        { x: 179, y: 100, width: 1.5, height: 80, rotation: 0 },
        canvas,
        2,
        pan,
      ),
    ).toBe(oldNormal);

    // Minimum size with zoom = 0.25 -> minScreen = Math.max(0.25, 1) = 1
    expect(
      clampTransformAbsoluteBox(
        oldNormal,
        { x: 100, y: 100, width: 80, height: 0.5, rotation: 0 },
        canvas,
        0.25,
        pan,
      ),
    ).toBe(oldNormal);

    // Flipped (negative width) returns oldBox
    expect(
      clampTransformAbsoluteBox(
        oldNormal,
        { x: 180, y: 100, width: -20, height: 80, rotation: 0 },
        canvas,
        1,
        pan,
      ),
    ).toBe(oldNormal);

    // Box already protruding outside canvas (e.g., canvas shrunk to 512x512):
    // oldBox spans X [-80, 620], Y [-40, 560]
    const protruding: AbsoluteBox = {
      x: -80,
      y: -40,
      width: 700,
      height: 600,
      rotation: 0,
    };

    // Resizing inward (shrinking left from -80 to 40, right from 620 to 480) succeeds!
    const shrunkInward: AbsoluteBox = {
      x: 40,
      y: 20,
      width: 440,
      height: 460,
      rotation: 0,
    };
    expect(
      clampTransformAbsoluteBox(protruding, shrunkInward, canvas, 1, pan),
    ).toEqual(shrunkInward);

    // Attempting to expand even further outside is clamped to oldBox's outer limits (-80, 620)
    const pushedFurtherOut: AbsoluteBox = {
      x: -150,
      y: -100,
      width: 850,
      height: 750,
      rotation: 0,
    };
    expect(
      clampTransformAbsoluteBox(protruding, pushedFurtherOut, canvas, 1, pan),
    ).toEqual({
      x: -80,
      y: -40,
      width: 700,
      height: 600,
      rotation: 0,
    });
  });

  it("handles IEEE 754 floating-point precision on 1px-tall horizontal resize and rejects NaN/Infinity boxes", () => {
    const canvas = { width: 1280, height: 768 };
    const zoom = 1.3;
    const pan = { x: 0, y: 40 };

    // 1px-tall rectangle at world y = 10 -> absY = 53, absH = 1.3
    // In IEEE 754: (53 + 1.3) - 53 === 1.2999999999999972 < 1.3
    const y = pan.y + 10 * zoom;
    const h = 1 * zoom;
    expect(y + h - y).toBeLessThan(h);

    const oldThin: AbsoluteBox = {
      x: 130,
      y,
      width: 130,
      height: h,
      rotation: 0,
    };
    const resizedHoriz: AbsoluteBox = {
      x: 130,
      y,
      width: 260,
      height: h,
      rotation: 0,
    };
    const res = clampTransformAbsoluteBox(
      oldThin,
      resizedHoriz,
      canvas,
      zoom,
      pan,
    );
    expect(res.width).toBeCloseTo(260, 6);
    expect(res.x).toBe(130);
    expect(res.y).toBe(y);

    // Non-finite values in newBox must safely return oldBox
    expect(
      clampTransformAbsoluteBox(
        oldThin,
        { x: Number.NaN, y, width: 200, height: 50, rotation: 0 },
        canvas,
        zoom,
        pan,
      ),
    ).toBe(oldThin);
    expect(
      clampTransformAbsoluteBox(
        oldThin,
        { x: 100, y: Number.POSITIVE_INFINITY, width: 200, height: 50, rotation: 0 },
        canvas,
        zoom,
        pan,
      ),
    ).toBe(oldThin);
    expect(
      clampTransformAbsoluteBox(
        oldThin,
        { x: 100, y, width: Number.NaN, height: 50, rotation: 0 },
        canvas,
        zoom,
        pan,
      ),
    ).toBe(oldThin);
    expect(
      clampTransformAbsoluteBox(
        oldThin,
        { x: 100, y, width: 200, height: Number.NEGATIVE_INFINITY, rotation: 0 },
        canvas,
        zoom,
        pan,
      ),
    ).toBe(oldThin);
  });
});
