export type ItemLabel = "object" | "character" | "text";
export type CanvasType = "single" | "multi_panel" | "collage";

/**
 * MOSS-Image model-facing bounding box: [y_min, x_min, y_max, x_max]
 * Origin (0, 0) is at the canvas center. X increases right, Y increases down.
 * Values are integer pixels.
 */
export type BBoxYxyx = [number, number, number, number];

/** Konva top-left origin rectangle in image pixel space. */
export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ModelLayoutSummary {
  caption: string;
  meta?: string[];
  canvas?: CanvasType;
  palette?: string[];
}

export interface ModelLayoutItem {
  label: ItemLabel;
  caption: string;
  bbox: BBoxYxyx;
  text?: string;
  tags?: string[];
  palette?: string[];
}

export interface ModelLayoutJson {
  summary: ModelLayoutSummary;
  items: ModelLayoutItem[];
  bbox_coord_space: "abs_centralized";
  bbox_format: "yxyx";
}

export interface EditorSummary {
  caption: string;
  meta: string[];
  canvas: CanvasType | "";
  palette: string[];
}

export interface EditorItem {
  /** Internal UI management ID only. Never exported to model JSON. */
  id: string;
  label: ItemLabel;
  caption: string;
  text: string;
  tags: string[];
  palette: string[];
  bbox: BBoxYxyx;
}

export interface DocumentState {
  width: number;
  height: number;
  summary: EditorSummary;
  items: EditorItem[];
}

export interface ProjectFileV1 {
  format: "nz-moss-project";
  version: 1;
  canvas: {
    width: number;
    height: number;
  };
  layout: ModelLayoutJson;
}

export interface ValidationIssue {
  path: string;
  message: string;
  itemId?: string;
}

export const MIN_CANVAS_SIZE = 16;
export const MAX_CANVAS_SIZE = 8192;

export const ITEM_LABELS: readonly ItemLabel[] = ["object", "character", "text"];
export const CANVAS_TYPES: readonly CanvasType[] = ["single", "multi_panel", "collage"];

export interface CanvasPreset {
  label: string;
  width: number;
  height: number;
}

export const CANVAS_PRESETS: readonly CanvasPreset[] = [
  { label: "1024 × 1024 (1:1)", width: 1024, height: 1024 },
  { label: "1280 × 768 (5:3)", width: 1280, height: 768 },
  { label: "1536 × 1024 (3:2)", width: 1536, height: 1024 },
  { label: "1024 × 1536 (2:3)", width: 1024, height: 1536 },
  { label: "1344 × 768 (7:4)", width: 1344, height: 768 },
  { label: "768 × 1344 (4:7)", width: 768, height: 1344 },
  { label: "1152 × 896 (9:7)", width: 1152, height: 896 },
  { label: "896 × 1152 (7:9)", width: 896, height: 1152 },
  { label: "1920 × 1088 (16:9)", width: 1920, height: 1088 },
];

export type ThemeMode = "light" | "dark";

export interface ItemTheme {
  bg: string;
  head: string;
  line: string;
  ink: string;
}

export const ITEM_THEMES: Record<ItemLabel, ItemTheme> = {
  text: { bg: "#f6f8fd", head: "#eaf0fa", line: "#8296b8", ink: "#365a96" },
  character: { bg: "#fff9ef", head: "#f9edda", line: "#d3a557", ink: "#965c12" },
  object: { bg: "#effaf5", head: "#e2f2e9", line: "#66a996", ink: "#176d59" },
};

export const ITEM_THEMES_DARK: Record<ItemLabel, ItemTheme> = {
  text: { bg: "#1c273b", head: "#24344f", line: "#5a7ec2", ink: "#b6d0ff" },
  character: { bg: "#2e2418", head: "#3d2f1e", line: "#c28c3a", ink: "#f7cf8b" },
  object: { bg: "#182c27", head: "#203b34", line: "#4b9c84", ink: "#99e2cb" },
};

export function getItemTheme(label: ItemLabel, mode: ThemeMode): ItemTheme {
  return mode === "dark" ? ITEM_THEMES_DARK[label] : ITEM_THEMES[label];
}
