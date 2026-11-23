import { describe, expect, it } from "vitest";
import {
  buildModelLayoutJson,
  parseImportJson,
  serializeModelLayout,
  serializeProjectFile,
} from "../src/core/serializer";
import type { DocumentState } from "../src/core/types";

function sampleDoc(): DocumentState {
  return {
    width: 1280,
    height: 768,
    summary: {
      caption: "A poster with a cat.",
      meta: ["poster"],
      canvas: "single",
      palette: ["blue", "white"],
    },
    items: [
      {
        id: "internal-id-1",
        label: "character",
        caption: "A white cat sitting.",
        text: "",
        tags: ["cat"],
        palette: ["white"],
        bbox: [-200, -200, 200, 200],
      },
      {
        id: "internal-id-2",
        label: "text",
        caption: "Large bold letters.",
        text: "こんにちは\n世界",
        tags: [],
        palette: [],
        bbox: [-350, -150, -250, 150],
      },
    ],
  };
}

describe("serializer", () => {
  it("excludes internal id, canvas width/height, and empty optional arrays from model JSON", () => {
    const doc = sampleDoc();
    doc.summary.meta = [];
    doc.summary.canvas = "";
    const model = buildModelLayoutJson(doc);

    expect(Object.keys(model).sort()).toEqual([
      "bbox_coord_space",
      "bbox_format",
      "items",
      "summary",
    ]);
    expect("width" in model).toBe(false);
    expect("height" in model).toBe(false);
    expect("meta" in model.summary).toBe(false);
    expect("canvas" in model.summary).toBe(false);
    expect("id" in model.items[0]).toBe(false);
    expect("tags" in model.items[1]).toBe(false);
    expect("palette" in model.items[1]).toBe(false);
    expect(model.items[1].text).toBe("こんにちは\n世界");
  });

  it("round-trips model JSON without losing any data (including unset canvas and optional text on object)", () => {
    const doc = sampleDoc();
    doc.summary.canvas = "";
    doc.items[0].text = "SIGN";
    const compact = serializeModelLayout(doc, false);
    expect(compact.includes("\n")).toBe(false);

    const imported = parseImportJson(compact, 1280, 768);
    expect(imported.kind).toBe("model");
    expect(imported.hasOutOfBounds).toBe(false);
    expect(imported.document.summary.canvas).toBe("");
    expect(imported.document.items[0].text).toBe("SIGN");
    expect(serializeModelLayout(imported.document, false)).toBe(compact);
  });

  it("round-trips project JSON with canvas dimensions preserved", () => {
    const doc = sampleDoc();
    doc.width = 1536;
    doc.height = 1024;
    const text = serializeProjectFile(doc);
    const imported = parseImportJson(text, 512, 512);
    expect(imported.kind).toBe("project");
    expect(imported.document.width).toBe(1536);
    expect(imported.document.height).toBe(1024);
    expect(serializeModelLayout(imported.document, false)).toBe(
      serializeModelLayout(doc, false),
    );
  });

  it("imports official MOSS-Image draft JSON (abs / xyxy) and converts to center-origin yxyx", () => {
    const draft = JSON.stringify({
      width: 1536,
      height: 1024,
      bbox_coord_space: "abs",
      bbox_format: "xyxy",
      summary: { caption: "Cup campaign", canvas: "single" },
      items: [
        {
          label: "object",
          caption: "Ceramic cup",
          bbox: [176, 224, 800, 864],
        },
      ],
    });
    const imported = parseImportJson(draft, 1280, 768);
    expect(imported.kind).toBe("official-draft");
    expect(imported.document.width).toBe(1536);
    expect(imported.document.height).toBe(1024);
    expect(imported.document.items[0].bbox).toEqual([-288, -592, 352, 32]);
  });

  it("rejects duplicate keys, unknown fields, and invalid JSON numbers", () => {
    expect(() =>
      parseImportJson(
        '{"summary":{"caption":"a","caption":"b"},"items":[],"bbox_coord_space":"abs_centralized","bbox_format":"yxyx"}',
        1280,
        768,
      ),
    ).toThrow(/重複/);

    expect(() =>
      parseImportJson(
        JSON.stringify({
          summary: { caption: "a" },
          items: [
            {
              id: "forbidden",
              label: "object",
              caption: "x",
              bbox: [0, 0, 10, 10],
            },
          ],
          bbox_coord_space: "abs_centralized",
          bbox_format: "yxyx",
        }),
        1280,
        768,
      ),
    ).toThrow(/未知のフィールド/);

    expect(() =>
      parseImportJson('{"summary":{"caption":"a"},"items":[NaN]}', 1280, 768),
    ).toThrow(/構文エラー/);
  });

  it("suggests enlarged canvas when imported model JSON exceeds current canvas, and flags >8192 overflow", () => {
    const largeModel = JSON.stringify({
      summary: { caption: "Large scene" },
      items: [
        { label: "object", caption: "Big", bbox: [-450, -700, 450, 700] },
      ],
      bbox_coord_space: "abs_centralized",
      bbox_format: "yxyx",
    });
    const res = parseImportJson(largeModel, 1024, 768);
    expect(res.hasOutOfBounds).toBe(true);
    expect(res.exceedsMaxCanvasSize).toBe(false);
    expect(res.suggestedCanvas).toEqual({ width: 1408, height: 912 });

    // P2-3: exceeds MAX_CANVAS_SIZE (8192) -> suggestedCanvas must be null
    const hugeModel = JSON.stringify({
      summary: { caption: "Huge scene" },
      items: [
        { label: "object", caption: "Huge", bbox: [-200, -5000, 200, 5000] },
      ],
      bbox_coord_space: "abs_centralized",
      bbox_format: "yxyx",
    });
    const hugeRes = parseImportJson(hugeModel, 1280, 768);
    expect(hugeRes.hasOutOfBounds).toBe(true);
    expect(hugeRes.exceedsMaxCanvasSize).toBe(true);
    expect(hugeRes.suggestedCanvas).toBeNull();
    expect(hugeRes.requiredCanvas).toEqual({ width: 10000, height: 400 });
  });

  it("rejects fractional bbox coordinates in model JSON while supporting official draft floor/ceil", () => {
    // P2-5: fractional coordinates in model-facing JSON must throw
    const fractionalModel = JSON.stringify({
      summary: { caption: "Fractional test" },
      items: [
        { label: "object", caption: "Box", bbox: [-100.5, -50, 100, 50] },
      ],
      bbox_coord_space: "abs_centralized",
      bbox_format: "yxyx",
    });
    expect(() => parseImportJson(fractionalModel, 1280, 768)).toThrow(/整数/);

    // Official draft JSON allows fractional coordinates using floor/ceil
    const fractionalDraft = JSON.stringify({
      width: 1024,
      height: 1024,
      bbox_coord_space: "abs",
      bbox_format: "xyxy",
      summary: { caption: "Fractional draft" },
      items: [
        {
          label: "object",
          caption: "Box",
          bbox: [100.8, 200.9, 300.2, 400.1],
        },
      ],
    });
    const draftRes = parseImportJson(fractionalDraft, 1280, 768);
    expect(draftRes.kind).toBe("official-draft");
    // floor(200.9)-512 = -312, floor(100.8)-512 = -412, ceil(400.1)-512 = -111, ceil(300.2)-512 = -211
    expect(draftRes.document.items[0].bbox).toEqual([-312, -412, -111, -211]);
  });
});
