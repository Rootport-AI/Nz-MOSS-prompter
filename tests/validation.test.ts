import { describe, expect, it } from "vitest";
import type { DocumentState } from "../src/core/types";
import { findDuplicateJsonKeys, validateDocument } from "../src/core/validation";

function makeValidDoc(): DocumentState {
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
        id: "id-1",
        label: "character",
        caption: "A white cat sitting.",
        text: "",
        tags: ["cat"],
        palette: ["white"],
        bbox: [-200, -200, 200, 200],
      },
      {
        id: "id-2",
        label: "text",
        caption: "Large bold letters.",
        text: "HELLO\nWORLD",
        tags: [],
        palette: [],
        bbox: [-350, -150, -250, 150],
      },
    ],
  };
}

describe("validateDocument", () => {
  it("accepts a valid document with overlapping items", () => {
    const doc = makeValidDoc();
    // Overlap item 2 with item 1
    doc.items[1].bbox = [-180, -180, 180, 180];
    expect(validateDocument(doc)).toEqual([]);
  });

  it("detects invalid canvas resolution (non-multiple of 16)", () => {
    const doc = makeValidDoc();
    doc.width = 1000;
    doc.height = 770;
    const issues = validateDocument(doc);
    expect(issues.some((i) => i.path === "canvas.width")).toBe(true);
    expect(issues.some((i) => i.path === "canvas.height")).toBe(true);
  });

  it("detects missing required fields (summary.caption, items[], item.caption, text for text label)", () => {
    const doc = makeValidDoc();
    doc.summary.caption = "   ";
    doc.items[0].caption = "";
    doc.items[1].text = "  ";
    const issues = validateDocument(doc);
    expect(issues.map((i) => i.path)).toEqual(
      expect.arrayContaining([
        "summary.caption",
        "items[0].caption",
        "items[1].text",
      ]),
    );

    doc.items = [];
    expect(validateDocument(doc).some((i) => i.path === "items")).toBe(true);
  });

  it("detects out-of-bounds and inverted bbox", () => {
    const doc = makeValidDoc();
    doc.items[0].bbox = [-400, -200, 200, 200]; // -400 < -384
    doc.items[1].bbox = [100, 100, 50, 200]; // y_min > y_max
    const issues = validateDocument(doc);
    expect(issues.filter((i) => i.path.endsWith(".bbox")).length).toBe(2);
  });
});

describe("findDuplicateJsonKeys", () => {
  it("detects top-level and nested duplicate keys", () => {
    expect(findDuplicateJsonKeys('{"a": 1, "a": 2}')).toEqual(["a"]);
    expect(
      findDuplicateJsonKeys('{"summary":{"caption":"x","caption":"y"}}'),
    ).toEqual(["caption"]);
  });

  it("does not report false positives for strings containing colon/braces or sibling objects", () => {
    const json = JSON.stringify({
      summary: { caption: '{"a": 1, "a": 2}' },
      items: [
        { label: "object", caption: "A", bbox: [0, 0, 10, 10] },
        { label: "object", caption: "B", bbox: [0, 0, 10, 10] },
      ],
    });
    expect(findDuplicateJsonKeys(json)).toEqual([]);
  });
});
