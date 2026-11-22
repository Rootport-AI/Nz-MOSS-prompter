# Nz-MOSS-prompter

ブラウザだけで **MOSS-Image 向けの Layout JSON（`abs_centralized` / `yxyx`）を視覚的に作成・編集できる**エディタ。  
**画像生成バックエンドなし・完全クライアントサイド**で動作し、生成した JSON を Stable Diffusion Forge neo や ComfyUI へそのままコピー＆ペーストして使えます。

> ⚠️ 本プロジェクトは **OpenMOSS / MOSS-Image** の Layout JSON 仕様に対応した非公式ツールです。  
> OpenMOSS プロジェクトとは独立して開発されています。

## デモ (GitHub Pages)
- URL: https://rootport-ai.github.io/Nz-MOSS-prompter/

## 使い方
1. GitHub Pages のデモ（またはローカル開発サーバー）を開く
2. 左パネルでキャンバス解像度（16の倍数）と `Summary`（画像全体の説明文など）を設定
3. ツールバーの `＋ Object` / `＋ Character` / `＋ Text` で矩形を追加し、ドラッグ移動・ハンドル拡縮・帯ドロップダウン（種別切替）・ダブルクリック（テキスト直接編集）でレイアウトを作成
4. 各矩形の `⚙️` ボタンから右パネルを開き、`Caption` / `Text` / `Tags` / `Palette` / `Bounding Box (yxyx)` を詳細調整
5. 左パネル上部の `JSON` タブに切り替え、`Copy`（1行コンパクト／整形切替可）または `Export` で出力して Forge neo / ComfyUI へ貼り付け

## 特徴
- **MOSS-Image 公式モデル向け座標系を正本に採用**: キャンバス中央原点 `(0, 0)`・絶対ピクセル整数・`[y_min, x_min, y_max, x_max]`（`abs_centralized` / `yxyx`）
- **PowerPoint 風 WYSIWYG 操作**: 複数矩形の重なり許容、8方向リサイズ、ホイールズーム＆Spaceドラッグパン（ズームしても `bbox` 座標は不変）
- **日本語 IME・複数行対応**: 矩形ダブルクリックで直接編集、`Enter` 改行 / `Ctrl+Enter`（`Cmd+Enter`）確定
- **極小矩形でも操作可能な `⚙️` ボタン**: 矩形が極端に小さくても固定サイズでクリック可能
- **厳密なバリデーション＆マルチ形式インポート**: モデル向け JSON / プロジェクト JSON / 公式 Draft JSON（`abs` / `xyxy`）の読み込みに対応
- **ライト／ダークモード切替**＆ブラウザ自動保存（`localStorage`）
- **キーボードショートカット**: `Ctrl+Z`（Undo）、`Ctrl+Y` / `Ctrl+Shift+Z`（Redo）、`Ctrl+D`（複製）、`Delete`（削除）

## 開発・ビルド・テスト

Node.js 22 以上を推奨します。

```bash
npm install
npm run dev      # ローカル開発サーバー (http://localhost:5173)
npm test         # Vitest 自動テスト実行
npm run build    # TypeScript 型チェック + dist/ へ静的ビルド
```

## ライセンス
MIT © Rootport-AI
