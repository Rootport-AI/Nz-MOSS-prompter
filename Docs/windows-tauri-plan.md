# Nz-MOSS-prompter Windows ネイティブ版（Tauri 2）設計方針

## 1. 概要と配布形態
- 既存の React + Vite + Konva フロントエンド（GitHub Pages Web 版）のコア編集ロジックおよび UI デザインを一切破壊せず、そのまま **Tauri 2** で Windows x64 ネイティブデスクトップアプリとしてパッケージングする。
- 配布形態は **ZIP ポータブル配布**（`Nz-MOSS-prompter-vX.Y.Z-win-x64.zip`）とし、インストーラー不要・管理者権限不要で展開後すぐに `Nz-MOSS-prompter.exe` を起動可能とする。
- ZIP 構成：`Nz-MOSS-prompter.exe` / `LICENSE` / `README.txt`、および検証用の `Nz-MOSS-prompter-vX.Y.Z-win-x64.zip.sha256`。
- `build.windows.staticVCRuntime: true` により Visual C++ ランタイムを静的リンクし、WebView2 Loader も静的リンクされる構成とすることで、追加 DLL 同梱不要な単一実行ファイルとする（Windows 11 標準搭載の Microsoft Edge WebView2 ランタイムを前提）。

## 2. 完全オフライン・最小権限セキュリティ設計
- **外部通信ゼロ**: 入力内容やレイアウト JSON を外部サーバーへ送信する機能を持たない。フロントエンド資産は `../dist` を実行バイナリ内に埋め込む。
- **最小権限（Deny-All Capability）**:
  - `src-tauri/tauri.conf.json` で `"withGlobalTauri": false` とし、`window.__TAURI__` グローバル注入を無効化。
  - `src-tauri/capabilities/default.json` で `"permissions": []` を明示し、Tauri IPC コマンド・プラグイン権限を一切付与しない。
- **厳格な CSP**:
  - 本番 `csp`:
    `default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'`
  - React / Konva の要素インラインスタイルのみ `style-src-attr 'unsafe-inline'` で許可し、外部通信（`connect-src 'none'`）や `<style>`・インラインスクリプトを遮断する。
  - 開発時 `devCsp` のみ Vite HMR（`localhost:5173` / `127.0.0.1:5173`）を許可する。
- **ナビゲーション・ポップアップ遮断（`src-tauri/src/main.rs`）**:
  - `tauri.conf.json` で `"create": false` とし、`setup()` 内で `WebviewWindowBuilder::from_config` から明示的にメインウィンドウを構築する（`unwrap()` / パニック禁止）。
  - `.on_new_window(|_, _| NewWindowResponse::Deny)` により `window.open` 等の新規ウィンドウ生成を全面拒否する。
  - `.on_navigation(...)` にて構造化 URL 検証関数 `is_allowed_navigation(url: &tauri::Url, allow_dev: bool) -> bool` を適用：
    - `about:blank` を許可。
    - `blob:` は内部パスを `tauri::Url::parse` で再帰検証（`blob:` ネストおよび `blob:about:blank` は拒否）。
    - `username` / `password`（userinfo）を含む URL はすべて拒否。
    - 本番許可オリジン: `http://tauri.localhost`（ポート指定なし）または `tauri://localhost`（ポート指定なし）。
    - 開発許可オリジン（`debug_assertions` 時のみ）: `http://localhost:5173` または `http://127.0.0.1:5173`。
    - 上記以外の外部ドメイン、偽装サブドメイン、別ポート、`https://`、`javascript:`、`file:`、`data:` 等はすべて遮断。
- **起動失敗時のフォールバック通知**:
  - WebView2 ランタイム欠如等で `.run(...)` が失敗した場合、`#[cfg(windows)]` の Win32 `MessageBoxW`（`user32` 直接リンク、UTF-16 内部 NUL 除去・NUL 終端）で日本語エラーダイアログを表示して終了コード `1` で終了する。

## 3. WebView2 互換性とローカルデータ保存先
- **保存先**: WebView2 の既定ユーザーデータディレクトリ配下（`%LOCALAPPDATA%\io.github.rootport-ai.nz-moss-prompter\EBWebView\`）の `localStorage` に自動保存される。
  - 同一 Windows ユーザー内であれば ZIP 展開フォルダの移動やバージョン更新後も編集データが保持される。
  - 別 PC への移行や Web 版とのやり取りには、既存の JSON Export / Import 機能を使用する。
- **Tauri 非依存の最小フロントエンド改善（Web 版共通）**:
  - `src/App.tsx`: `downloadTextFile` の `URL.revokeObjectURL` を `15_000ms` 遅延化し、WebView2 の非同期ダウンロード開始前の Blob 破棄を防止。`copyToClipboard` フォールバックの `style.cssText` 代入を個別プロパティ設定へ変更（CSP 互換）。
  - `src/state/useEditorStore.ts`: `docRef` により最新ドキュメントを参照し、自動保存デバウンスを `150ms` に短縮。`pagehide` に加え `beforeunload` と `visibilitychange`（`hidden` 時）で同期フラッシュを実行（`preventDefault()` は呼ばない）。

## 4. GitHub Actions CI/CD 構成
- **既存 Web 版維持**: `.github/workflows/pages.yml`（Ubuntu `npm ci` + `npm test` + `npm run build` + GitHub Pages デプロイ）は一切変更しない。`package-lock.json` に Linux / Windows 両方の `@tauri-apps/cli` optionalDependencies が含まれる状態を維持する。
- **Windows リリースワークフロー（`.github/workflows/windows-release.yml`）**:
  - トリガー: `v*.*.*` タグプッシュおよび手動 `workflow_dispatch`。
  - `build` ジョブ（`windows-latest` / `pwsh`）:
    1. `package.json`・`src-tauri/tauri.conf.json`・`src-tauri/Cargo.toml` のバージョン完全一致検証（タグ実行時は `^v[0-9]+\.[0-9]+\.[0-9]+$` および `v<version>` 一致検証）。
    2. `npm ci` / `npm run typecheck` / `npm test` / `cargo test`。
    3. `npx tauri build --no-bundle --target x86_64-pc-windows-msvc`。
    4. `dumpbin /dependents` で `webview2loader.dll` / `vcruntime140.dll` / `vcruntime140_1.dll` / `msvcp140.dll` 非依存を検証。
    5. `Nz-MOSS-prompter.exe` + `LICENSE` + `README.txt` を ZIP 化し、BOM なし UTF-8・LF の `.sha256` を生成・再計算検証して Artifact アップロード。
  - `release` ジョブ（`ubuntu-latest`、タグ実行時のみ）:
    1. Artifact 取得後、Ubuntu 側でも `sha256sum -c *.sha256` でクロス OS 整合性を検証。
    2. `gh release` で GitHub Releases へ作成または `--clobber` 更新公開。
