import { isBBoxValid, isValidDimension } from "./coordinates";
import {
  CANVAS_TYPES,
  type DocumentState,
  ITEM_LABELS,
  MAX_CANVAS_SIZE,
  MIN_CANVAS_SIZE,
  type ValidationIssue,
} from "./types";

const LABEL_SET = new Set<string>(ITEM_LABELS);
const CANVAS_SET = new Set<string>(CANVAS_TYPES);

export function validateDocument(doc: DocumentState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isValidDimension(doc.width)) {
    issues.push({
      path: "canvas.width",
      message: `キャンバス幅は ${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE} の16の倍数である必要があります。`,
    });
  }
  if (!isValidDimension(doc.height)) {
    issues.push({
      path: "canvas.height",
      message: `キャンバス高さは ${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE} の16の倍数である必要があります。`,
    });
  }

  if (doc.summary.caption.trim().length === 0) {
    issues.push({
      path: "summary.caption",
      message: "summary.caption は必須です（空白のみ不可）。",
    });
  }
  if (doc.summary.canvas !== "" && !CANVAS_SET.has(doc.summary.canvas)) {
    issues.push({
      path: "summary.canvas",
      message: "summary.canvas は single / multi_panel / collage のいずれかである必要があります。",
    });
  }
  doc.summary.meta.forEach((entry, idx) => {
    if (entry.trim().length === 0) {
      issues.push({
        path: `summary.meta[${idx}]`,
        message: `summary.meta[${idx}] が空文字です。`,
      });
    }
  });
  doc.summary.palette.forEach((entry, idx) => {
    if (entry.trim().length === 0) {
      issues.push({
        path: `summary.palette[${idx}]`,
        message: `summary.palette[${idx}] が空文字です。`,
      });
    }
  });

  if (doc.items.length === 0) {
    issues.push({
      path: "items",
      message: "items には少なくとも1つの矩形が必要です。",
    });
  }

  doc.items.forEach((item, index) => {
    const loc = `items[${index}]`;
    if (!LABEL_SET.has(item.label)) {
      issues.push({
        path: `${loc}.label`,
        message: `${loc}.label は object / character / text のいずれかである必要があります。`,
        itemId: item.id,
      });
    }
    if (item.caption.trim().length === 0) {
      issues.push({
        path: `${loc}.caption`,
        message: `${loc}.caption は必須です（空白のみ不可）。`,
        itemId: item.id,
      });
    }
    if (item.label === "text" && item.text.trim().length === 0) {
      issues.push({
        path: `${loc}.text`,
        message: `${loc}: label が text の場合、text フィールドは必須です。`,
        itemId: item.id,
      });
    }
    item.tags.forEach((tag, idx) => {
      if (tag.trim().length === 0) {
        issues.push({
          path: `${loc}.tags[${idx}]`,
          message: `${loc}.tags[${idx}] が空文字です。`,
          itemId: item.id,
        });
      }
    });
    item.palette.forEach((color, idx) => {
      if (color.trim().length === 0) {
        issues.push({
          path: `${loc}.palette[${idx}]`,
          message: `${loc}.palette[${idx}] が空文字です。`,
          itemId: item.id,
        });
      }
    });

    const [yMin, xMin, yMax, xMax] = item.bbox;
    if (!item.bbox.every((v) => Number.isSafeInteger(v))) {
      issues.push({
        path: `${loc}.bbox`,
        message: `${loc}.bbox は4つの整数である必要があります。`,
        itemId: item.id,
      });
    } else if (!(yMin < yMax && xMin < xMax)) {
      issues.push({
        path: `${loc}.bbox`,
        message: `${loc}.bbox は y_min < y_max かつ x_min < x_max である必要があります。`,
        itemId: item.id,
      });
    } else if (
      isValidDimension(doc.width) &&
      isValidDimension(doc.height) &&
      !isBBoxValid(item.bbox, doc.width, doc.height)
    ) {
      issues.push({
        path: `${loc}.bbox`,
        message: `${loc}.bbox がキャンバス範囲（X: ±${doc.width / 2}, Y: ±${doc.height / 2}）を超えています。`,
        itemId: item.id,
      });
    }
  });

  return issues;
}

/**
 * Lightweight scanner that detects duplicate keys within the same JSON object level
 * prior to standard JSON.parse(), matching official compile_prompt.py behavior
 * without maintaining a full custom JSON parser.
 */
export function findDuplicateJsonKeys(source: string): string[] {
  const duplicates: string[] = [];
  type Frame =
    | { kind: "object"; keys: Set<string>; expectKey: boolean }
    | { kind: "array" };
  const stack: Frame[] = [];
  let i = 0;
  const len = source.length;

  const skipWs = () => {
    while (i < len && /\s/.test(source[i])) i += 1;
  };

  const readString = (): string | null => {
    if (source[i] !== '"') return null;
    const start = i;
    i += 1;
    while (i < len) {
      const ch = source[i];
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === '"') {
        i += 1;
        try {
          return JSON.parse(source.slice(start, i)) as string;
        } catch {
          return null;
        }
      }
      i += 1;
    }
    return null;
  };

  while (i < len) {
    skipWs();
    if (i >= len) break;
    const ch = source[i];
    const top = stack[stack.length - 1];

    if (ch === "{") {
      if (top && top.kind === "object") top.expectKey = false;
      stack.push({ kind: "object", keys: new Set(), expectKey: true });
      i += 1;
      continue;
    }
    if (ch === "[") {
      if (top && top.kind === "object") top.expectKey = false;
      stack.push({ kind: "array" });
      i += 1;
      continue;
    }
    if (ch === "}" || ch === "]") {
      stack.pop();
      i += 1;
      continue;
    }
    if (ch === ",") {
      if (top && top.kind === "object") top.expectKey = true;
      i += 1;
      continue;
    }
    if (ch === ":") {
      if (top && top.kind === "object") top.expectKey = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      const str = readString();
      if (str === null) break;
      if (top && top.kind === "object" && top.expectKey) {
        if (top.keys.has(str)) {
          duplicates.push(str);
        } else {
          top.keys.add(str);
        }
        top.expectKey = false;
      }
      continue;
    }
    // Primitive token (number, true, false, null)
    while (i < len && !/[\s,:\]{}\[]/.test(source[i])) {
      i += 1;
    }
  }

  return duplicates;
}
