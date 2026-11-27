# Nz-MOSS-prompter Windows デスクトップ版 リリース検証報告書 (`v0.1.0`)

## 1. 対象リリース
- **バージョン**: `v0.1.0`
- **パッケージング方式**: Tauri 2 / Windows x64 ポータブル ZIP 配布（`Nz-MOSS-prompter-v0.1.0-win-x64.zip` + `.sha256`）
- **同梱物**: `Nz-MOSS-prompter.exe` / `LICENSE` / `README.txt`

## 2. テスト・検証結果サマリー

| 検証項目 | 実行環境 / 参照 | 結果 | 詳細 |
| --- | --- | --- | --- |
| TypeScript 型チェック (`npm run typecheck`) | ローカル / CI | **PASS** | `tsc --noEmit` エラー 0 |
| フロントエンド単体テスト (`npm test`) | ローカル / CI | **PASS** | `vitest run` 5 ファイル / 32 テスト全通過 |
| Web 本番ビルド (`npm run build`) | ローカル / CI | **PASS** | `dist/` 静的生成、`./assets/...`・`./favicon.png`・`./favicon.ico` 相対パス確認 |
| GitHub Pages CI (`.github/workflows/pages.yml`) | `ubuntu-latest` (`Run #45756332103`) | **PASS** | `npm ci`（Linux optionalDependencies 含む）・`npm test`・`npm run build`・Pages デプロイ正常完了 |
| Windows CI 検証ビルド (`.github/workflows/windows-release.yml`) | `windows-latest` (`Run #45823396844`) | **PASS** | バージョン整合性検証（`package.json` / `tauri.conf.json` / `Cargo.toml` 一致）、`cargo test`（4 テスト関数：許可オリジン・`blob:` 再帰検証・拒否 URL パターン 29 種）、`tauri build --no-bundle --target x86_64-pc-windows-msvc`、`dumpbin /dependents`（`KERNEL32.dll` 検出かつ `WebView2Loader.dll` / `vcruntime140.dll` / `vcruntime140_1.dll` / `msvcp140.dll` 非依存確認）、ZIP（約 2.73 MB）＆ SHA-256 生成・再計算検証すべて通過 |
| Windows 11 実機動作検証 | Windows 11 (x64) | **PASS** | ユーザーによる ZIP 展開・`Nz-MOSS-prompter.exe` 起動および基本編集動作確認に合格 |
| カスタムアイコン・Web ファビコン検収 | ローカル生成＋目視検収 | **PASS** | 四隅白背景を逆アルファマッティング＋デフリンジ処理した 1024×1024 RGBA PNG から Tauri アイコン一式（`icon.ico` 6 解像度: 16/24/32/48/64/256px）および `public/favicon.png` / `public/favicon.ico` を生成。暗背景（`#111827`）・明背景（`#f3f5f8`）双方での白フチ・ジャギーなしを目視検収済み |

## 3. オフライン・セキュリティ仕様まとめ
- **外部送信なし（要件 6.3 必須説明文）**:
  > Windows版Nz-MOSS-prompterは、プロンプトの編集・保存をローカル環境内で行います。入力内容を外部サーバーへ送信する機能は搭載していません。
- **外部通信ゼロ**: フロントエンド資産をバイナリ内へ埋め込み、本番 CSP にて `connect-src 'none'` / `media-src 'none'` / `object-src 'none'` / `frame-src 'none'` / `form-action 'none'` を強制。
- **最小権限設計**: `tauri.conf.json` で `"withGlobalTauri": false`、および `src-tauri/capabilities/default.json` で `"permissions": []`（deny-all）を設定し、Tauri プラグイン・IPC 権限を一切付与していない。
- **厳格な CSP**: `default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'`。
- **ナビゲーション・ポップアップ遮断**: `src-tauri/src/main.rs` で `on_new_window(|_, _| NewWindowResponse::Deny)` および構造化 URL 検証 `is_allowed_navigation` を適用し、アプリ内オリジン（`http://tauri.localhost` / `tauri://localhost` / `about:blank` / 許可オリジン配下の非ネスト `blob:`）以外への遷移をすべて遮断。
- **起動失敗時のフォールバック通知**: WebView2 ランタイム欠如等で起動に失敗した場合、Win32 `MessageBoxW` により日本語案内ダイアログを表示して終了コード `1` で終了。

## 4. 既知の制限事項
- **Windows SmartScreen 警告（未署名バイナリ）**: 初版ではコード署名証明書を適用していないため、初回起動時に「Windows によって PC が保護されました」と表示される場合がある（「詳細情報」→「実行」で起動可能）。
- **Microsoft Edge WebView2 ランタイム前提**: Windows 11 には標準搭載されているが、WebView2 ランタイムを削除・無効化している環境では別途インストールが必要。
- **ローカルデータ保存先と移行**:
  - 保存先は `%LOCALAPPDATA%\io.github.rootport-ai.nz-moss-prompter\EBWebView\` 配下の `localStorage`。
  - 同一 Windows ユーザー内であれば ZIP 展開フォルダの移動・新バージョン差し替え時もデータは維持されるが、**別 PC への移行や Web 版（GitHub Pages）とのデータ共有にはアプリ内の JSON Export / Import 機能を使用する必要がある**。
- **初版非対象機能**: インストーラー（MSI / NSIS）、自動アップデーター、コード署名、ネイティブ OS ファイルダイアログ／ファイル関連付け、Windows 以外（macOS / Linux）向けバイナリ配布、画像生成バックエンド連携は初版の対象外。
- **`src-tauri/Cargo.lock` の扱い**: 本初版構築環境にはローカル Rust ツールチェーンが未導入のため、リポジトリには `src-tauri/Cargo.lock` をコミットしていない（`.gitignore` でも除外していない）。再現性向上のため、将来ローカル Rust 環境または CI 生成物から `src-tauri/Cargo.lock` を取得してバージョン管理下へ固定することを推奨する。
