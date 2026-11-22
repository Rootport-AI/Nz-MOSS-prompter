# Nz-MOSS-prompter 設計・実装計画書

作成日: 2026-11-22  
参照: [research-report.md](./research-report.md) / [moss_layout_editor_mock.html](../mock/moss_layout_editor_mock.html)

---

## 1. 確定仕様サマリー

| 項目 | 決定方針 |
|---|---|
| **技術スタック** | React 19 + TypeScript + Vite + Konva (`konva` / `react-konva`) + Vitest |
| **座標系の正本** | MOSS-Image モデル向け形式（`abs_centralized` / `yxyx` / 整数ピクセル、`[y_min, x_min, y_max, x_max]`） |
| **UI デザイン** | モック準拠のライトテーマ・3 ペイン構成（左右折りたたみ可）、種別カラー分け、中央原点十字ガイド |
| **UI 言語** | モック準拠（見出し・項目ラベルは英語、エラー・ツールチップ・確認メッセージは日本語） |
| **矩形操作** | Konva 描画 + `Transformer`（8 方向リサイズ、回転無効）+ ダブルクリックで HTML `<textarea>` 重ね編集（日本語 IME・複数行対応） |
| **`⚙️` ボタン** | スクリーン座標の HTML オーバーレイ層に固定 `24px × 24px` で配置。極小矩形・ズームアウト時でも操作可能サイズを維持し、クリックで右パネルを展開 |
| **未選択時の右パネル** | 未選択時は自動で折りたたむ。`⚙️` クリックで必ず展開。選択変更時は現在の開閉状態を維持 |
| **JSON 出力・コピー** | Live JSON は整形表示。コピーは「1 行コンパクト（公式準拠・既定）」と「整形 JSON」を切替可能。空の任意配列（`meta`, `palette`, `tags`）は省略し、内部 `id` や `width`/`height` を一切混入させない。`summary.canvas` は未指定（省略）も選択可能 |
| **保存・復元** | モデル向け JSON の Import / Export に加え、解像度込みのプロジェクト JSON 保存・読込、および `localStorage` 自動保存（300ms デバウンス・例外/破損フォールバック付き）を搭載 |
| **補助機能** | 削除（ボタン + Delete）、複製（Ctrl/Cmd+D）、Undo / Redo（Ctrl/Cmd+Z, Ctrl/Cmd+Y / Shift+Z、履歴上限 100・連続入力結合）、解像度プリセット（上限 8192px）、Layers パネルでの Z-order 入れ替え（「前面へ ▲ / 背面へ ▼」）、ズーム（25%〜300% / Fit）＆パン |

---

## 2. ディレクトリ構成

```text
Nz-MOSS-prompter/
├── Docs/
│   ├── research-report.md
│   └── architecture-plan.md
├── mock/
│   └── moss_layout_editor_mock.html
├── src/
│   ├── core/
│   │   ├── types.ts           # モデルJSON・内部状態・プロジェクト形式・バリデーション型
│   │   ├── coordinates.ts     # 中心原点 yxyx ⇔ Konva 左上原点変換、クランプ、移動/リサイズ
│   │   ├── validation.ts      # 公式 compile_prompt.py 準拠の厳密バリデーション
│   │   ├── serializer.ts      # モデルJSON出力、プロジェクトJSON出力、インポート解析
│   │   └── history.ts         # Undo/Redo 純粋履歴管理
│   ├── state/
│   │   └── useEditorStore.ts  # 状態管理（useReducer + localStorage 自動保存）
│   ├── components/
│   │   ├── Toolbar.tsx        # 上部ツールバー（+Rectangle、Undo/Redo、Import/Export、Project、Copy）
│   │   ├── LeftSidebar.tsx    # 左パネル（Canvas/JSONタブ、Size+プリセット、Summary、Layers+Z-order）
│   │   ├── CanvasStage.tsx    # 中央 Konva ステージ（ズーム/パン、矩形、Transformer、⚙️・textareaオーバーレイ）
│   │   ├── JsonView.tsx       # 中央 Live JSON ビュー（整形表示、コピー形式切替、バリデーション一覧）
│   │   ├── RightSidebar.tsx   # 右パネル（Label/Caption/Text/Tags/Palette、BBox双方向同期、複製・削除）
│   │   └── ImportModal.tsx    # JSON インポートダイアログ（ファイル/テキスト貼付、解像度確認）
│   ├── styles/
│   │   └── app.css            # モック準拠スタイル
│   ├── App.tsx
│   └── main.tsx
├── tests/
│   ├── coordinates.test.ts
│   ├── validation.test.ts
│   ├── serializer.test.ts
│   └── history.test.ts
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 3. コアモジュール設計詳細

### 3.1 データモデル（`src/core/types.ts`）
- **モデル向け JSON (`ModelLayoutJson`)**:
  - `summary`: `{ caption: string; meta?: string[]; canvas?: CanvasType; palette?: string[] }`
  - `items`: `Array<{ label: ItemLabel; caption: string; bbox: BBoxYxyx; text?: string; tags?: string[]; palette?: string[] }>`
  - `bbox_coord_space`: `"abs_centralized"`
  - `bbox_format`: `"yxyx"`
- **内部編集アイテム (`EditorItem`)**:
  - `id: string`（内部管理専用、出力時は完全除外）
  - `label: "object" | "character" | "text"`
  - `caption: string`
  - `text: string`
  - `tags: string[]`
  - `palette: string[]`
  - `bbox: [number, number, number, number]`（常に `[y_min, x_min, y_max, x_max]` 整数）
- **プロジェクトファイル (`ProjectFileV1`)**:
  - `format: "nz-moss-project"`
  - `version: 1`
  - `canvas: { width: number; height: number }`
  - `layout: ModelLayoutJson`

### 3.2 座標変換境界（`src/core/coordinates.ts`）
- 解像度範囲定数: `MIN_CANVAS_SIZE = 16`, `MAX_CANVAS_SIZE = 8192`（16 の倍数へスナップ）。
- すべての数値結果に `normalizeZero`（`-0 → 0`）を適用し、整数性を保証する。
- `yxyxToCanvasRect(bbox, width, height)` → `{ x, y, width, height }`（Konva 描画用）
- **移動とリサイズの分離**:
  - `translateBBox(bbox, dx, dy, width, height)`: 整数 `dx, dy` 加算で幅・高さを完全に不変保持（1px 伸縮を防止）。キャンバス内に収まる矩形のみクランプし、キャンバス縮小等で幅/高さがキャンバスを超過している矩形は無理にクランプしない（反転・ワープ防止）。
  - `resizeBBoxFromCanvasRect(rect, width, height)`: `x_min = clamp(round(x) - W/2, -W/2, W/2 - 1)` → `x_max = clamp(round(x + w) - W/2, x_min + 1, W/2)` の順で最小幅高 1px とキャンバス範囲内を同時に保証（`y` も同様）。
- `computeMinEnclosingCanvasSize(items)`: 中心原点対称性を考慮し `Math.max(16, Math.ceil(maxAbs / 8) * 16)` で最小包含解像度を算出。
- `isBBoxValid(bbox, width, height)`（順序・範囲チェック）
- ズーム倍率 (`zoom`)・パン位置 (`panX`, `panY`) は `Stage` の表示変換のみに適用し、`EditorItem.bbox` に一切影響させない。

### 3.3 バリデーション & 厳密インポート（`src/core/validation.ts` / `serializer.ts`）
`compile_prompt.py` に準拠し、以下の検証を構造化エラー配列（`ValidationIssue[]`）として返す：
1. キャンバス解像度: 正の整数かつ 16 の倍数（`16..8192`）
2. `summary.caption`: 空白のみの文字列不可
3. `summary.canvas`: 未指定（`undefined`）または `single` / `multi_panel` / `collage`
4. `summary.meta` / `summary.palette`: 配列内の各要素が非空文字列
5. `items`: 1 件以上の配列
6. 各 item:
   - `label` が `object` / `character` / `text`
   - `caption` が非空文字列
   - `label === "text"` のとき `text` が非空文字列（インポートされた `object`/`character` に非空 `text` があった場合は内部保持＋表示してラウンドトリップ欠落を防ぐ）
   - `bbox` が有限整数 4 要素、`y_min < y_max`、`x_min < x_max`、かつ `[-H/2, H/2]` / `[-W/2, W/2]` の範囲内
   - インポート時: 標準 `JSON.parse()`（構文・`NaN`/`Infinity` 検出）＋軽量なオブジェクト重複キースキャナで同一階層の重複キーを検出・エラー報告。未知フィールドも拒否。
7. エラー時の出力挙動: プロジェクト JSON 保存は WIP 保存のため常時許可。モデル向け JSON のコピー／エクスポート時はバリデーションエラー件数と警告を表示しつつ実行可能とする。

### 3.4 キャンバス上の操作設計（`src/components/CanvasStage.tsx`）
- **通常表示と `Transformer` アタッチ**:
  - `Transformer` は子ノードの `getClientRect` に引きずられる `Group` ではなく、**`bbox` 専用の矩形 `Rect`** にアタッチし、`rotateEnabled={false}` / `flipEnabled={false}` とする。
  - `boundBoxFunc(oldBox, newBox)` は絶対（スクリーン）座標で渡されるため、`stageScale` を掛けた最小サイズ（`Math.max(1 * stageScale, 1)`）で画像ピクセル基準の最小サイズ・反転防止を行う。
  - `onTransform` 中に `scaleX`/`scaleY` を `1` にリセットしつつ `width`/`height` を更新し、テキストや枠線の歪みを防止。`onTransformEnd` で確定 `bbox` とノード属性を必ず同期リセットする（React 再レンダリングスキップ対策）。
  - 背景・アートボード `Rect` に `name="canvas-deselect-target"` を付与して選択解除を確実化し、`useEffect([selectedId, items])` で `tr.nodes(node ? [node] : [])` を明示同期する。
- **直接テキスト編集**:
  - 矩形ダブルクリックで対象アイテムの Konva テキストを非表示にし、Stage コンテナ内（`position: relative`）の `position: absolute` で HTML `<textarea>` を配置する。座標は `getAbsolutePosition()` のみを使用（`getBoundingClientRect()` の二重加算を避ける）。
  - 極小矩形でも入力可能なよう `min-width: 160px; min-height: 64px` を設定しコンテナ内にクランプ。ズーム・パン・リサイズ発生時は編集を確定して閉じる。
  - 日本語 IME 対応: `compositionstart` / `compositionend` と `justComposed && e.keyCode === 229`（Safari 対策）および `e.isComposing` を併用。`Enter` で改行、`Ctrl/Cmd+Enter` または `blur` で確定、`Escape`（非変換中）でキャンセル。
- **`⚙️` ボタンオーバーレイ**:
  - オーバーレイコンテナは `position: absolute; inset: 0; overflow: hidden; pointer-events: none;` とし、画面外はみ出しを防止。
  - 各矩形の右上スクリーン座標へ `24px × 24px` 固定の `<button>`（`pointer-events: auto`、配列順 `z-index`・選択中最前面）を配置。画面上の幅または高さが `48px` 未満のときは矩形の右上外側へ自動オフセット。
  - ドラッグ／リサイズ中だけ対象アイテムの `⚙️` を一時非表示にし、取り残されや不要な 60fps 再レンダリングを回避する。

### 3.5 状態管理・入力制御・テスト方針（`src/state/useEditorStore.ts` / `tests/`）
- **履歴分離**: Undo/Redo の履歴対象（`DocumentState`）は `width, height, summary, items` のみに限定し、`selectedId`, `zoom`, `pan`, パネル開閉は含めない。`MAX_HISTORY = 100`、同一フィールドの連続テキスト編集は 600ms 以内で 1 エントリに結合。Undo/Redo 後は `selectedId` の存在チェックと右パネル自動折りたたみ再評価を行う。
- **ショートカット抑止**: フォーカスが `INPUT`/`TEXTAREA`/`SELECT`/`isContentEditable`、またはモーダル表示中、または IME 変換中の場合は、`Delete` / `Ctrl+Z` / `Ctrl+Y` / `Ctrl+D` / `Space` を一切横取りしない。
- **カンマ区切り入力 (`TagListInput`)**: フォーカス中はローカル文字列 state を編集し、`,` やスペース入力で文字が消える問題を防止。`blur`・選択切替時に配列から再同期。
- **自動テスト拡張**: `environment: "node"` のまま、`core/*` に加えて `tests/editorReducer.test.ts` で reducer 状態遷移・Undo 選択整合性・ショートカット抑止判定・`localStorage` 破損フォールバックを自動テストする。

---

## 4. 実装フェーズ計画

1. **Phase 1: プロジェクト構築（本フェーズ）**
   - `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore` 整備
   - 依存インストール、ビルド・テスト疎通確認
2. **Phase 2: コアロジック実装 & 自動テスト**
   - `src/core/*`（`types`, `coordinates`, `validation`, `serializer`, `history`）
   - `tests/*` による座標精度・バリデーション・ラウンドトリップ・Undo/Redo の自動テスト
3. **Phase 3: 状態管理 & UI コンポーネント実装**
   - `useEditorStore.ts`（`localStorage` 自動保存、ショートカット）
   - `Toolbar`, `LeftSidebar`, `RightSidebar`, `JsonView`, `ImportModal`
   - `CanvasStage`（Konva 描画、ズーム/パン、Transformer、`⚙️` オーバーレイ、IME 対応 `<textarea>` 直接編集）
4. **Phase 4: 統合検証 & 受け入れ条件チェック**
   - 全自動テスト通過・プロダクションビルド通過
   - ブラウザでの実動作確認（移動・拡縮・ズーム不変性・極小矩形 `⚙️`・日本語 IME・重なり・Import/Export・モデル JSON 清浄性）
