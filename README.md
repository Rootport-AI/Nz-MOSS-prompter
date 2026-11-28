# Nz-MOSS-prompter

ブラウザだけで **MOSS-Image 向けの Layout JSON（`abs_centralized` / `yxyx`）を視覚的に作成・編集できる**エディタ。  
**画像生成バックエンドなし・完全クライアントサイド**で動作し、生成した JSON を Stable Diffusion Forge neo や ComfyUI へそのままコピー＆ペーストして使えます。

> ⚠️ 本プロジェクトは **OpenMOSS / MOSS-Image** の Layout JSON 仕様に対応した非公式ツールです。  
> OpenMOSS プロジェクトとは独立して開発されています。

## デモ (GitHub Pages)
- URL: https://rootport-ai.github.io/Nz-MOSS-prompter/

## Windows デスクトップ版 (オフライン動作)

Windows版Nz-MOSS-prompterは、プロンプトの編集・保存をローカル環境内で行います。入力内容を外部サーバーへ送信する機能は搭載していません。

### 入手・起動方法
1. [GitHub Releases](https://github.com/rootport-ai/Nz-MOSS-prompter/releases) から `Nz-MOSS-prompter-vX.Y.Z-win-x64.zip` をダウンロードします。
2. ZIP を任意のフォルダへ展開し、`Nz-MOSS-prompter.exe` をダブルクリックして起動します。
   - **インストーラー不要・管理者権限不要**のポータブル形式です。
   - 動作前提: **Windows 11 (x64)** および **Microsoft Edge WebView2 ランタイム**（Windows 11 には標準搭載）。

### 初回起動時の Windows SmartScreen 警告について
本アプリはコード署名を行っていないため、初回起動時に「Windows によって PC が保護されました」と表示される場合があります。内容をご確認のうえ、「詳細情報」→「実行」を選択して起動してください。

### ローカルデータ保存と移行・削除
- **保存先**: `%LOCALAPPDATA%\io.github.rootport-ai.nz-moss-prompter\EBWebView\`
- **継続利用**: 同一 Windows ユーザー内であれば、ZIP 展開フォルダの移動や新バージョンへのアップデート後も、編集中のデータやテーマ設定は自動的に維持されます。
- **データ移行**: 別 PC への移行や Web 版（GitHub Pages）とのデータ共有には、アプリ内の JSON **Export / Import** 機能をご利用ください。
- **完全削除**: 展開したアプリフォルダと、上記の `%LOCALAPPDATA%\io.github.rootport-ai.nz-moss-prompter\EBWebView\` フォルダを削除してください。

## 使い方
1. GitHub Pages のデモ（または Windows デスクトップ版・ローカル開発サーバー）を開く
2. 左パネルでキャンバス解像度（16の倍数、`1920 × 1088` などのプリセット対応）と `Summary`（画像全体の説明文など）を設定
3. ツールバーの `＋ Object` / `＋ Character` / `＋ Text` で矩形を追加し、ドラッグ移動・ハンドル拡縮・帯ドロップダウン（種別切替）・ダブルクリック（テキスト直接編集）でレイアウトを作成（既存の `.json` ファイルはキャンバス上へドラッグ＆ドロップでも読み込み可能）
4. 各矩形の `⚙️` ボタンから右パネルを開き、`Caption` / `Text` / `Tags` / `Palette` / `Bounding Box (yxyx)` を詳細調整
5. ヘッダー右端の `⚙` ボタン（Settings）からライト／ダークテーマ切替や矩形のタイトル・本文フォントサイズを好みで調整
6. 左パネル上部の `JSON` タブに切り替え、`Copy`（1行コンパクト／整形切替可）または `Export` で出力して Forge neo / ComfyUI へ貼り付け

## 特徴
- **MOSS-Image 公式モデル向け座標系を正本に採用**: キャンバス中央原点 `(0, 0)`・絶対ピクセル整数・`[y_min, x_min, y_max, x_max]`（`abs_centralized` / `yxyx`）
- **PowerPoint 風 WYSIWYG 操作**: 複数矩形の重なり許容、8方向リサイズ、ドラッグ／リサイズ時のキャンバス枠内クランプ、ホイールズーム＆Spaceドラッグパン（ズームしても `bbox` 座標は不変）
- **日本語 IME・複数行対応**: 矩形ダブルクリックで直接編集、`Enter` 改行 / `Ctrl+Enter`（`Cmd+Enter`）確定
- **極小矩形でも操作可能な `⚙️` ボタン**: 矩形が極端に小さくても固定サイズでクリック可能
- **厳密なバリデーション＆マルチ形式インポート**: モデル向け JSON / プロジェクト JSON / 公式 Draft JSON（`abs` / `xyxy`）の読み込みに対応（キャンバス上への `.json` ドラッグ＆ドロップ対応）
- **設定画面（ヘッダー右端 `⚙`）**: ライト／ダークモード切替、矩形タイトル／本文フォントサイズ調整（ライブプレビュー付き）、および自動保存（`localStorage`）
- **キーボードショートカット**: `Ctrl+C` / `Ctrl+V`（`Cmd+C` / `Cmd+V`、矩形コピー＆ペースト）、`Ctrl+D`（複製）、`Ctrl+Z`（Undo）、`Ctrl+Y` / `Ctrl+Shift+Z`（Redo）、`Delete`（削除）

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
