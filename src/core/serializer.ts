import {
  computeMinEnclosingCanvasSize,
  isBBoxValid,
  isValidDimension,
  normalizeZero,
} from "./coordinates";
import {
  type BBoxYxyx,
  CANVAS_TYPES,
  type CanvasType,
  type DocumentState,
  type EditorItem,
  type EditorSummary,
  ITEM_LABELS,
  type ItemLabel,
  type ModelLayoutItem,
  type ModelLayoutJson,
  type ModelLayoutSummary,
  type ProjectFileV1,
} from "./types";
import { findDuplicateJsonKeys } from "./validation";

const MODEL_ROOT_FIELDS = new Set([
  "summary",
  "items",
  "bbox_coord_space",
  "bbox_format",
]);
const DRAFT_ROOT_FIELDS = new Set([
  "width",
  "height",
  "bbox_coord_space",
  "bbox_format",
  "summary",
  "items",
]);
const SUMMARY_FIELDS = new Set(["caption", "meta", "canvas", "palette"]);
const ITEM_FIELDS = new Set([
  "label",
  "caption",
  "bbox",
  "text",
  "tags",
  "palette",
]);
const LABEL_SET = new Set<string>(ITEM_LABELS);
const CANVAS_SET = new Set<string>(CANVAS_TYPES);

let fallbackIdCounter = 1;

export function createItemId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackIdCounter += 1;
  return `item-${fallbackIdCounter}`;
}

/**
 * Build clean MOSS-Image model-facing JSON object.
 * Strictly strips internal IDs, canvas dimensions, and empty optional fields.
 */
export function buildModelLayoutJson(doc: DocumentState): ModelLayoutJson {
  const summary: ModelLayoutSummary = {
    caption: doc.summary.caption,
  };
  if (doc.summary.meta.length > 0) {
    summary.meta = [...doc.summary.meta];
  }
  if (doc.summary.canvas !== "") {
    summary.canvas = doc.summary.canvas;
  }
  if (doc.summary.palette.length > 0) {
    summary.palette = [...doc.summary.palette];
  }

  const items: ModelLayoutItem[] = doc.items.map((item) => {
    const out: ModelLayoutItem = {
      label: item.label,
      caption: item.caption,
      bbox: [
        normalizeZero(item.bbox[0]),
        normalizeZero(item.bbox[1]),
        normalizeZero(item.bbox[2]),
        normalizeZero(item.bbox[3]),
      ],
    };
    if (item.label === "text" || item.text.trim().length > 0) {
      out.text = item.text;
    }
    if (item.tags.length > 0) {
      out.tags = [...item.tags];
    }
    if (item.palette.length > 0) {
      out.palette = [...item.palette];
    }
    return out;
  });

  return {
    summary,
    items,
    bbox_coord_space: "abs_centralized",
    bbox_format: "yxyx",
  };
}

export function serializeModelLayout(
  doc: DocumentState,
  pretty: boolean,
): string {
  const model = buildModelLayoutJson(doc);
  return pretty ? JSON.stringify(model, null, 2) : JSON.stringify(model);
}

export function buildProjectFile(doc: DocumentState): ProjectFileV1 {
  return {
    format: "nz-moss-project",
    version: 1,
    canvas: {
      width: doc.width,
      height: doc.height,
    },
    layout: buildModelLayoutJson(doc),
  };
}

export function serializeProjectFile(doc: DocumentState): string {
  return `${JSON.stringify(buildProjectFile(doc), null, 2)}\n`;
}

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export interface DroppedFileLike {
  name: string;
  size: number;
  type?: string;
}

/**
 * Select and validate a dropped file for JSON import.
 * Prefers a `.json` file (case-insensitive) when multiple files are dropped.
 */
export function selectDroppedImportFile<T extends DroppedFileLike>(
  files: readonly T[],
): { file?: T; error?: string } {
  if (files.length === 0) {
    return { error: "ドロップされたファイルが見つかりません。" };
  }

  const chosen =
    files.find((f) => f.name.toLowerCase().endsWith(".json")) ?? files[0];

  if (!Number.isFinite(chosen.size) || chosen.size <= 0) {
    return { error: "空のファイルまたはフォルダは読み込めません。" };
  }

  if (chosen.size > MAX_IMPORT_FILE_BYTES) {
    return { error: "ファイルサイズが上限（5MB）を超えています。" };
  }

  const hasJsonExt = chosen.name.toLowerCase().endsWith(".json");
  const dotIdx = chosen.name.lastIndexOf(".");
  const hasExtension = dotIdx > 0 && dotIdx < chosen.name.length - 1;
  const mime = (chosen.type ?? "").trim().toLowerCase();
  const isAllowedMime =
    mime === "text/plain" ||
    mime.startsWith("text/plain;") ||
    mime.includes("json") ||
    (mime === "" && !hasExtension);

  if (!hasJsonExt && !isAllowedMime) {
    return { error: "JSON ファイル（.json）をドロップしてください。" };
  }

  return { file: chosen };
}

export type ImportSourceKind = "model" | "project" | "official-draft";

export interface ImportResult {
  kind: ImportSourceKind;
  document: DocumentState;
  hasOutOfBounds: boolean;
  /** Suggested canvas size that encloses all items, or null if impossible within MAX_CANVAS_SIZE. */
  suggestedCanvas: { width: number; height: number } | null;
  /** True when enclosing all items would require dimensions exceeding MAX_CANVAS_SIZE. */
  exceedsMaxCanvasSize: boolean;
  /** Unclamped required dimensions when exceedsMaxCanvasSize is true. */
  requiredCanvas: { width: number; height: number } | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertAllowedFields(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  required: readonly string[],
  location: string,
): void {
  const keys = Object.keys(obj);
  const unknown = keys.filter((k) => !allowed.has(k)).sort();
  if (unknown.length > 0) {
    throw new Error(`${location}: 未知のフィールドが含まれています: ${unknown.join(", ")}`);
  }
  const missing = required.filter((k) => !Object.hasOwn(obj, k)).sort();
  if (missing.length > 0) {
    throw new Error(`${location}: 必須フィールドが不足しています: ${missing.join(", ")}`);
  }
}

function parseStringArray(value: unknown, location: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(`${location} は文字列の配列である必要があります。`);
  }
  return [...value];
}

function parseSummary(raw: unknown): EditorSummary {
  if (!isPlainObject(raw)) {
    throw new Error("summary は JSON オブジェクトである必要があります。");
  }
  assertAllowedFields(raw, SUMMARY_FIELDS, ["caption"], "summary");
  if (typeof raw.caption !== "string") {
    throw new Error("summary.caption は文字列である必要があります。");
  }
  let canvas: CanvasType | "" = "";
  if (Object.hasOwn(raw, "canvas")) {
    if (typeof raw.canvas !== "string" || !CANVAS_SET.has(raw.canvas)) {
      throw new Error("summary.canvas は single / multi_panel / collage のいずれかである必要があります。");
    }
    canvas = raw.canvas as CanvasType;
  }
  return {
    caption: raw.caption,
    meta: Object.hasOwn(raw, "meta") ? parseStringArray(raw.meta, "summary.meta") : [],
    canvas,
    palette: Object.hasOwn(raw, "palette")
      ? parseStringArray(raw.palette, "summary.palette")
      : [],
  };
}

function parseBBoxNumbers(raw: unknown, location: string): BBoxYxyx {
  if (!Array.isArray(raw) || raw.length !== 4) {
    throw new Error(`${location} は4要素の数値配列である必要があります。`);
  }
  const nums = raw.map((v) => {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`${location} には有限な数値のみ指定できます。`);
    }
    if (!Number.isSafeInteger(v)) {
      throw new Error(
        `${location} の座標は整数である必要があります（小数は指定できません）: ${v}`,
      );
    }
    return normalizeZero(v);
  });
  return [nums[0], nums[1], nums[2], nums[3]];
}

function parseItem(
  raw: unknown,
  index: number,
  convertFromDraft?: { width: number; height: number },
): EditorItem {
  const loc = `items[${index}]`;
  if (!isPlainObject(raw)) {
    throw new Error(`${loc} は JSON オブジェクトである必要があります。`);
  }
  assertAllowedFields(raw, ITEM_FIELDS, ["label", "caption", "bbox"], loc);
  if (typeof raw.label !== "string" || !LABEL_SET.has(raw.label)) {
    throw new Error(`${loc}.label は object / character / text のいずれかである必要があります。`);
  }
  if (typeof raw.caption !== "string") {
    throw new Error(`${loc}.caption は文字列である必要があります。`);
  }
  let text = "";
  if (Object.hasOwn(raw, "text")) {
    if (typeof raw.text !== "string") {
      throw new Error(`${loc}.text は文字列である必要があります。`);
    }
    text = raw.text;
  }

  let bbox: BBoxYxyx;
  if (convertFromDraft) {
    if (!Array.isArray(raw.bbox) || raw.bbox.length !== 4) {
      throw new Error(`${loc}.bbox は4要素の数値配列である必要があります。`);
    }
    const vals = raw.bbox.map((v) => {
      if (typeof v !== "number" || !Number.isFinite(v)) {
        throw new Error(`${loc}.bbox には有限な数値のみ指定できます。`);
      }
      return v;
    });
    const [x1, y1, x2, y2] = vals;
    const halfW = Math.floor(convertFromDraft.width / 2);
    const halfH = Math.floor(convertFromDraft.height / 2);
    bbox = [
      normalizeZero(Math.floor(y1) - halfH),
      normalizeZero(Math.floor(x1) - halfW),
      normalizeZero(Math.ceil(y2) - halfH),
      normalizeZero(Math.ceil(x2) - halfW),
    ];
  } else {
    bbox = parseBBoxNumbers(raw.bbox, `${loc}.bbox`);
  }

  return {
    id: createItemId(),
    label: raw.label as ItemLabel,
    caption: raw.caption,
    text,
    tags: Object.hasOwn(raw, "tags") ? parseStringArray(raw.tags, `${loc}.tags`) : [],
    palette: Object.hasOwn(raw, "palette")
      ? parseStringArray(raw.palette, `${loc}.palette`)
      : [],
    bbox,
  };
}

function parseModelLayoutObject(
  raw: Record<string, unknown>,
  width: number,
  height: number,
): DocumentState {
  assertAllowedFields(
    raw,
    MODEL_ROOT_FIELDS,
    ["summary", "items", "bbox_coord_space", "bbox_format"],
    "root",
  );
  if (raw.bbox_coord_space !== "abs_centralized") {
    throw new Error('bbox_coord_space は "abs_centralized" である必要があります。');
  }
  if (raw.bbox_format !== "yxyx") {
    throw new Error('bbox_format は "yxyx" である必要があります。');
  }
  if (!Array.isArray(raw.items)) {
    throw new Error("items は配列である必要があります。");
  }
  const summary = parseSummary(raw.summary);
  const items = raw.items.map((item, idx) => parseItem(item, idx));
  return { width, height, summary, items };
}

/**
 * Parse and validate an imported JSON string.
 * Supports:
 * 1. Nz-MOSS project JSON (includes canvas width & height)
 * 2. MOSS-Image model-facing JSON (abs_centralized / yxyx)
 * 3. MOSS-Image official Draft JSON (abs / xyxy + width & height)
 */
export function parseImportJson(
  rawText: string,
  currentWidth: number,
  currentHeight: number,
): ImportResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("JSON テキストが空です。");
  }

  const dupKeys = findDuplicateJsonKeys(trimmed);
  if (dupKeys.length > 0) {
    throw new Error(`重複した JSON キーが含まれています: ${dupKeys.join(", ")}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`JSON の構文エラーです: ${detail}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error("ルートは JSON オブジェクトである必要があります。");
  }

  // 1. Nz-MOSS Project file
  if (parsed.format === "nz-moss-project") {
    if (parsed.version !== 1) {
      throw new Error(`未対応のプロジェクトバージョンです: ${String(parsed.version)}`);
    }
    if (!isPlainObject(parsed.canvas)) {
      throw new Error("project.canvas が不正です。");
    }
    const width = parsed.canvas.width;
    const height = parsed.canvas.height;
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !isValidDimension(width) ||
      !isValidDimension(height)
    ) {
      throw new Error("project.canvas の幅・高さは16の倍数の正の整数である必要があります。");
    }
    if (!isPlainObject(parsed.layout)) {
      throw new Error("project.layout が不正です。");
    }
    const document = parseModelLayoutObject(parsed.layout, width, height);
    const hasOutOfBounds = document.items.some(
      (item) => !isBBoxValid(item.bbox, width, height),
    );
    const minSize = hasOutOfBounds
      ? computeMinEnclosingCanvasSize(document.items)
      : null;
    return {
      kind: "project",
      document,
      hasOutOfBounds,
      suggestedCanvas:
        minSize && !minSize.exceedsMax
          ? {
              width: Math.max(width, minSize.width),
              height: Math.max(height, minSize.height),
            }
          : null,
      exceedsMaxCanvasSize: Boolean(minSize?.exceedsMax),
      requiredCanvas: minSize?.exceedsMax
        ? { width: minSize.requiredWidth, height: minSize.requiredHeight }
        : null,
    };
  }

  // 2. Official Draft JSON (abs / xyxy + width/height)
  if (parsed.bbox_coord_space === "abs" && parsed.bbox_format === "xyxy") {
    assertAllowedFields(
      parsed,
      DRAFT_ROOT_FIELDS,
      ["width", "height", "bbox_coord_space", "bbox_format", "summary", "items"],
      "draft",
    );
    const width = parsed.width;
    const height = parsed.height;
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !isValidDimension(width) ||
      !isValidDimension(height)
    ) {
      throw new Error("draft の width / height は16の倍数の正の整数である必要があります。");
    }
    if (!Array.isArray(parsed.items)) {
      throw new Error("items は配列である必要があります。");
    }
    const summary = parseSummary(parsed.summary);
    const items = parsed.items.map((item, idx) =>
      parseItem(item, idx, { width, height }),
    );
    const document: DocumentState = { width, height, summary, items };
    const hasOutOfBounds = items.some(
      (item) => !isBBoxValid(item.bbox, width, height),
    );
    const minSize = hasOutOfBounds
      ? computeMinEnclosingCanvasSize(items)
      : null;
    return {
      kind: "official-draft",
      document,
      hasOutOfBounds,
      suggestedCanvas:
        minSize && !minSize.exceedsMax
          ? {
              width: Math.max(width, minSize.width),
              height: Math.max(height, minSize.height),
            }
          : null,
      exceedsMaxCanvasSize: Boolean(minSize?.exceedsMax),
      requiredCanvas: minSize?.exceedsMax
        ? { width: minSize.requiredWidth, height: minSize.requiredHeight }
        : null,
    };
  }

  // 3. MOSS-Image Model-facing JSON (abs_centralized / yxyx)
  const document = parseModelLayoutObject(parsed, currentWidth, currentHeight);
  const hasOutOfBounds = document.items.some(
    (item) => !isBBoxValid(item.bbox, currentWidth, currentHeight),
  );
  const minSize = hasOutOfBounds
    ? computeMinEnclosingCanvasSize(document.items)
    : null;
  return {
    kind: "model",
    document,
    hasOutOfBounds,
    suggestedCanvas:
      minSize && !minSize.exceedsMax
        ? {
            width: Math.max(currentWidth, minSize.width),
            height: Math.max(currentHeight, minSize.height),
          }
        : null,
    exceedsMaxCanvasSize: Boolean(minSize?.exceedsMax),
    requiredCanvas: minSize?.exceedsMax
      ? { width: minSize.requiredWidth, height: minSize.requiredHeight }
      : null,
  };
}
