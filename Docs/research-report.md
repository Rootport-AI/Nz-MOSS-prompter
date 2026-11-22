# Nz-MOSS-prompter 事前技術調査レポート

作成日: 2026-11-22  
対象リポジトリ: `Nz-MOSS-prompter`

本ドキュメントは、実装開始に先立ち実施した **MOSS-Image公式仕様**、**先行実装（`moss-image-community/moss-image-layout-editor`）**、および **Konva.js / react-konva 実装方式** の調査結果をまとめたものである。

---

## 1. MOSS-Image 公式仕様の調査

参照元:
- `OpenMOSS/MOSS-Image` — `USERGUIDE.md`
- `OpenMOSS/MOSS-Image` — `skills/moss-image-prompt-enhancer/references/layout.md`
- `OpenMOSS/MOSS-Image` — `skills/moss-image-prompt-enhancer/scripts/compile_prompt.py`

### 1.1 解像度とモデル要件
- **解像度制約**: 幅・高さともに **正の整数かつ 16 の倍数** である必要がある（公式API・コンパイラともに 16 の倍数以外はエラー）。
- **推奨画素数**: 合計 1M / 1.5M / 2M ピクセルを推奨（0.25M `512×512` ～ 4M 2K まで外挿可能）。任意のアスペクト比に対応。
- **解像度の扱い**: モデル向け Layout JSON には `width` / `height` を**含めない**。生成ツール側（Stable Diffusion Forge neo / ComfyUI 等）で解像度を指定する。

### 1.2 モデル向け Layout JSON 仕様（本アプリの正本）

```json
{
  "summary": {
    "caption": "A minimalist travel poster with a cream background, a blue mountain illustration, and the title EXPLORE at the top.",
    "meta": ["poster"],
    "canvas": "single",
    "palette": ["cream", "dark-blue"]
  },
  "items": [
    {
      "label": "text",
      "caption": "Large dark-blue uppercase title centered at the top.",
      "text": "EXPLORE",
      "bbox": [-416, -384, -288, 384]
    },
    {
      "label": "object",
      "caption": "A flat blue mountain illustration in the lower center.",
      "bbox": [-192, -288, 384, 288]
    }
  ],
  "bbox_coord_space": "abs_centralized",
  "bbox_format": "yxyx"
}
```

#### 座標系
- `bbox_coord_space`: `"abs_centralized"`（キャンバス中央を `(0, 0)` とする絶対ピクセル座標）
- `bbox_format`: `"yxyx"`（`[y_min, x_min, y_max, x_max]`）
- 軸方向: X は右向きが正、Y は下向きが正。
- 座標範囲: 幅 $W$・高さ $H$（いずれも偶数かつ 16 の倍数）のキャンバスでは、
  - $X \in [-W/2,\ +W/2]$
  - $Y \in [-H/2,\ +H/2]$
- 数値は整数ピクセル。

#### スキーマと厳密なバリデーションルール（`compile_prompt.py` より抽出）

| 階層 | 必須フィールド | 任意フィールド | 制約・ルール |
|---|---|---|---|
| Root | `summary`, `items`, `bbox_coord_space`, `bbox_format` | なし | 未知フィールド禁止。`bbox_coord_space === "abs_centralized"`、`bbox_format === "yxyx"` |
| `summary` | `caption` | `meta`, `canvas`, `palette` | 未知フィールド禁止。`caption` は空白以外の文字を含む非空文字列。`canvas` は `"single" \| "multi_panel" \| "collage"`。`meta` / `palette` は非空文字列の配列 |
| `items[]` | `label`, `caption`, `bbox` | `text`, `tags`, `palette` | `items` は **非空のフラット配列**。未知フィールド（`id`, `children`, `parent` 等）禁止 |

各 `items[]` フィールドの細則:
- `label`: `"object"` / `"character"` / `"text"` のいずれか。
- `caption`: 非空文字列（空白のみ不可）。`text` 要素でもフォント・色・表面処理など見た目の説明として必須。
- `text`: `label === "text"` の場合は**必須**。表示する厳密な文字列。意図した改行は JSON 文字列内の `\n` で表現する。任意指定として存在する場合も非空文字列であること。
- `tags`, `palette`: 指定する場合は非空文字列の配列。
- `bbox`: 有限数値4要素 `[y_min, x_min, y_max, x_max]`。
  - 正の幅・高さを持つこと（`y_min < y_max` かつ `x_min < x_max`）。
  - キャンバス範囲内に収まること（`-H/2 <= y_min < y_max <= H/2` かつ `-W/2 <= x_min < x_max <= W/2`）。
- **重なり**: 複数アイテムの `bbox` 重複・共有は公式に許容されている（例：オブジェクト上のテキスト）。
- **JSON 構文上の制約**: 重複キー禁止、`NaN`/`Infinity` 禁止、UTF-8（`ensure_ascii=False` 相当で日本語・中国語をエスケープせず出力可能）。

### 1.3 公式 Draft 形式との違い
公式の `moss-image-prompt-enhancer` スキルでは、LLM に生成させる中間形式として「Draft JSON」（左上原点 `abs`、`xyxy`、`width`/`height` 必須）を定義し、`compile_prompt.py` でモデル向け JSON に変換している。

一方、**Nz-MOSS-prompter ではユーザー裁定により、モデル向け JSON（`abs_centralized` / `yxyx`）を内部データの正本として直接採用する。** これにより、UI 上の数値編集と出力 JSON の間に二重座標系のズレが生じない。

---

## 2. 先行実装の調査（`moss-image-community/moss-image-layout-editor`）

参照元: `https://github.com/moss-image-community/moss-image-layout-editor`（Apache-2.0）

### 2.1 技術スタック・構成
- **ビルド・テスト**: Vite 6 / TypeScript 5.9 / Vitest 3（フロントエンドのみの静的サイト）
- **UI 実装**: React や Canvas ライブラリ（Konva 等）を使わず、Vanilla TypeScript + DOM / CSS（`src/main.ts` 約 62KB）で実装。
- **モジュール構成**:
  - `src/compile/compilePrompt.ts` / `json.ts` / `errors.ts`: 公式 `compile_prompt.py` の忠実な TypeScript 移植（CPython の `round(x, 9)` 偶数丸めまで BigInt で再現）。
  - `src/editor/model.ts`: 編集状態管理、Draft/Compiled 相互変換、移動・リサイズ計算。
  - `src/editor/history.ts`: Undo/Redo 履歴管理。
  - `src/editor/reference.ts`: リファレンス画像オーバーレイと解像度合わせ。
  - `tests/compilePrompt.test.ts`: 公式 `test_compile_prompt.py` の移植テスト。

### 2.2 注目すべき仕様・工夫
1. **モデル向け JSON のインポート対応（`editorFromCompiled`）**:
   - `width`/`height` を持たないモデル向け JSON を読み込む際、現在のキャンバス幅・高さの中心 `(W/2, H/2)` を基準に復元している。
2. **キャンバスサイズ変更時の挙動**:
   - キャンバスの幅・高さを変更しても、既存矩形の座標を無断で比例拡縮しない。
3. **厳密なフィールド検査**:
   - 未知フィールド・重複キー・`NaN`/`Infinity`・空白のみ文字列を明確なエラーメッセージで検出。
4. **実用的な補助機能**:
   - 解像度プリセット（`1024×1024`, `1536×1024`, `1024×1536`, `1344×768` 等）、Undo/Redo、`localStorage` 自動保存。

### 2.3 Nz-MOSS-prompter との相違点・設計上の判断

| 観点 | 先行実装 (`moss-image-layout-editor`) | Nz-MOSS-prompter（本アプリ方針） | 判断 |
|---|---|---|---|
| 内部座標系 | 左上原点 `abs` / `xyxy`（Draft 形式） | **中央原点 `abs_centralized` / `yxyx` 整数ピクセル** | **踏襲しない**（ユーザー裁定に従いモデル向け JSON を正本にする） |
| 描画基盤 | Vanilla DOM / CSS | **React + TypeScript + Konva.js (`react-konva`)** | **踏襲しない**（ズーム・パン・Transformer・状態管理の保守性を優先） |
| 画面レイアウト | 左パネルに Summary・Item List・Inspector を縦積み、右に JSON プレビュー | **PowerPoint 型 3 ペイン**（左：キャンバス＆Summary、中央：編集キャンバス、右：選択時のみ開く詳細設定） | **踏襲しない**（要件の WYSIWYG 操作性を実現） |
| 矩形内編集 | Inspector フォーム中心 | **キャンバス上でダブルクリック直接編集（HTML `textarea` 重ね）** | **独自実装**（日本語 IME・複数行対応必須） |
| 極小矩形の操作 | 通常ハンドルのみ | **常時操作可能サイズを維持する `⚙️` ボタン** | **独自実装** |
| バリデーション観点 | `compile_prompt.py` 完全準拠の検証とテスト群 | 同様の厳密検証をモデル向け JSON 正本に対して適用 | **知見を流用**（検証ルール・テスト観点を網羅する） |
| 解像度変更時の挙動 | 無断で比例拡縮しない | 無断で比例拡縮しない | **一致**（範囲外矩形は警告で可視化） |

---

## 3. 技術調査：Konva.js (`react-konva`) 実装上の重要ポイント

### 3.1 座標変換の境界設計
内部状態（正本）は常に `[y_min, x_min, y_max, x_max]`（中心原点・整数）で保持し、Konva の描画・操作境界に純粋関数を置く。

- **正本 → Konva（左上原点）**:
  - `x = x_min + W / 2`
  - `y = y_min + H / 2`
  - `width = x_max - x_min`
  - `height = y_max - y_min`
- **Konva → 正本（中心原点・整数）**:
  - `x_min = Math.round(x) - W / 2`
  - `y_min = Math.round(y) - H / 2`
  - `x_max = Math.round(x + width) - W / 2`
  - `y_max = Math.round(y + height) - H / 2`
  - 最小サイズ保証: `x_max = Math.max(x_min + 1, x_max)`、`y_max = Math.max(y_min + 1, y_max)`（整数座標で幅・高さ ≥ 1px を維持）。

### 3.2 ズーム・パンと座標不変性
- ズーム・パンは Konva `Stage` の `scaleX` / `scaleY` と `x` / `y`（ビューポート変換）のみで制御する。
- キャンバス矩形（アートボード）および各アイテムの Konva ノードは、常に「画像ピクセル座標（`0..W`, `0..H`）」空間に配置する。
- これにより、ズーム倍率やパン位置を変えてもアイテムの論理座標・`bbox` は一切変化しない。

### 3.3 `Transformer` の設定
- 初期バージョンでは回転・反転は対象外のため、`rotateEnabled={false}`、`flipEnabled={false}` を設定する。
- Konva のリサイズは既定で `scaleX` / `scaleY` を変更するため、`onTransformEnd` 内で `width * scaleX` / `height * scaleY` を計算して `scaleX = 1, scaleY = 1` にリセットし、整数 `bbox` として状態へ反映する。
- `boundBoxFunc` で幅・高さが極端に潰れて反転するのを防ぐ（例：最小 1px 以上）。

### 3.4 矩形内テキストの直接編集と日本語 IME 対応
Konva 公式の `Editable Text` パターンをズーム対応・IME 対応で実装する。

- **位置・サイズ同期**:
  - Konva ノードの `getAbsolutePosition()` と `getAbsoluteScale()`、および `stage.container().getBoundingClientRect()` を組み合わせて、HTML `<textarea>` を画面上の正確な位置・拡大率に重ねる。
  - 編集対象は `label === "text"` のとき `item.text`、`object` / `character` のとき `item.caption`。
- **日本語 IME（変換確定）の安全な処理**:
  - `compositionstart` / `compositionend` および `event.nativeEvent.isComposing`（および Safari/一部環境向け `keyCode === 229`）を監視する。
  - **変換中の `Enter` / `Escape` で編集終了しない** ように制御する。
- **改行と確定の操作設計**:
  - 複数行テキスト（特に `text` の `\n`）を自然に扱えるよう、`Enter` は通常の改行とし、`Ctrl+Enter`（Mac は `Cmd+Enter`）またはフォーカスアウト（`blur`）で確定、`Escape`（非変換時）で編集終了/キャンセルとするのが安全。

### 3.5 極小矩形でも操作可能な `⚙️` ボタンの実装方式
要件：「各矩形には『⚙️』ボタンを付ける。矩形を極端に小さくしてもボタンは画面上で操作可能なサイズを維持する。」

推奨方式：**キャンバスコンテナ上の HTML オーバーレイ層（スクリーン座標配置）**
- 各アイテムの右上角のキャンバス座標 `(x_max + W/2, y_min + H/2)` を現在の `stageScale` と `stagePos` でスクリーン座標に変換し、固定サイズ（例：`24px × 24px`）の HTML `<button>` として配置する。
- **利点**:
  1. ズームアウト時や矩形が `4px × 4px` のような極小サイズになっても、ボタンは常に `24px × 24px` の押しやすいサイズと鮮明な描画を維持できる。
  2. 矩形の右上外側（または上端オフセット位置）に配置すれば、極小矩形のドラッグ領域や `Transformer` ハンドルを完全に塞ぐことなく操作できる。
  3. アクセシビリティ（キーボードフォーカス・`aria-label`・ホバー表示）も標準 DOM として扱いやすい。

---

## 4. 実装に向けた設計方針のまとめ

1. **データモデルと出力の完全分離**:
   - 内部編集アイテムは管理用 `id` を持つが、モデル向け JSON シリアライズ関数（`serializeModelLayout`）で許可フィールドのみを抽出し、`id`・`width`・`height` 等の混入を構造的に防ぐ。
   - プロジェクト保存形式（例：`.moss-project.json`）を別途用意し、`width`/`height` とモデル向けレイアウトをまとめて保存・復元可能にする。
2. **インポート時の扱い**:
   - **モデル向け JSON**（`abs_centralized` / `yxyx`）：現在のキャンバス解像度で読み込みつつ、範囲外の `bbox` がある場合は警告表示または最小包含解像度（16の倍数）への変更を提案する。
   - **プロジェクト JSON**（解像度付き）：`width`/`height` を含めて完全復元する。
   - （必要に応じて公式 Draft 形式 `abs`/`xyxy` の読み込みも補助的に判定・変換できるよう拡張余地を残す。）
3. **自動テスト対象（Vitest）**:
   - 座標変換（中心原点 `yxyx` ⇔ Konva 左上原点）の往復精度テスト。
   - ドラッグ移動・リサイズ・ズーム不変性のロジックテスト。
   - スキーマバリデーション（解像度 16 の倍数、範囲外 `bbox`、必須項目欠落、未知フィールド、空文字、`label: "text"` 時の `text` 必須）。
   - インポート／エクスポートのラウンドトリップ整合性テスト（情報欠落なし、独自プロパティ非混入）。
