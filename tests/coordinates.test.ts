import { describe, expect, it } from "vitest";
import {
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
import type { BBoxYxyx } from "../src/core/types";

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
});
