#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};

fn is_allowed_navigation(url: &tauri::Url, allow_dev: bool) -> bool {
    if url.as_str() == "about:blank" {
        return true;
    }

    if url.scheme() == "blob" {
        let Ok(inner) = tauri::Url::parse(url.path()) else {
            return false;
        };
        if inner.scheme() == "blob" || inner.as_str() == "about:blank" {
            return false;
        }
        return is_allowed_navigation(&inner, allow_dev);
    }

    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }

    let scheme = url.scheme();
    let host = url.host_str();
    let port = url.port();

    let is_prod = (scheme == "http" && host == Some("tauri.localhost") && port.is_none())
        || (scheme == "tauri" && host == Some("localhost") && port.is_none());

    if is_prod {
        return true;
    }

    if allow_dev
        && scheme == "http"
        && matches!(host, Some("localhost") | Some("127.0.0.1"))
        && port == Some(5173)
    {
        return true;
    }

    false
}

#[cfg(windows)]
fn show_startup_error(err: &tauri::Error) {
    const MB_OK: u32 = 0x0000_0000;
    const MB_ICONERROR: u32 = 0x0000_0010;

    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(
            hwnd: *mut std::ffi::c_void,
            lp_text: *const u16,
            lp_caption: *const u16,
            u_type: u32,
        ) -> i32;
    }

    fn to_wide_nul(s: &str) -> Vec<u16> {
        s.encode_utf16()
            .filter(|&c| c != 0)
            .chain(std::iter::once(0))
            .collect()
    }

    let title = to_wide_nul("Nz-MOSS-prompter");
    let message = to_wide_nul(&format!(
        "Nz-MOSS-prompter の起動に失敗しました。\nMicrosoft Edge WebView2 ランタイムがインストールされているか確認してください。\n\n詳細: {err}"
    ));

    // SAFETY: `message` and `title` are NUL-terminated UTF-16 slices kept alive
    // for the synchronous `MessageBoxW` call, and a null HWND is valid.
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}

#[cfg(not(windows))]
fn show_startup_error(err: &tauri::Error) {
    eprintln!("Nz-MOSS-prompter failed to start: {err}");
}

fn main() {
    let result = tauri::Builder::default()
        .setup(|app| {
            let win_cfg = app
                .config()
                .app
                .windows
                .first()
                .ok_or("missing main window configuration in tauri.conf.json")?;

            WebviewWindowBuilder::from_config(app.handle(), win_cfg)?
                .on_navigation(|url| is_allowed_navigation(url, cfg!(debug_assertions)))
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(err) = result {
        show_startup_error(&err);
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::is_allowed_navigation;
    use tauri::Url;

    fn allowed(raw: &str, allow_dev: bool) -> bool {
        let parsed = Url::parse(raw).expect("test URL must be syntactically valid");
        is_allowed_navigation(&parsed, allow_dev)
    }

    #[test]
    fn allows_prod_origins_and_about_blank() {
        assert!(allowed("about:blank", false));
        assert!(allowed("about:blank", true));
        assert!(allowed("http://tauri.localhost/", false));
        assert!(allowed("http://tauri.localhost/index.html", false));
        assert!(allowed("tauri://localhost/", false));
        assert!(allowed("tauri://localhost/index.html", false));
    }

    #[test]
    fn allows_dev_origins_only_when_allow_dev_is_true() {
        assert!(!allowed("http://localhost:5173/", false));
        assert!(!allowed("http://127.0.0.1:5173/", false));
        assert!(allowed("http://localhost:5173/", true));
        assert!(allowed("http://127.0.0.1:5173/index.html", true));
    }

    #[test]
    fn blocks_external_spoofed_userinfo_port_and_other_schemes() {
        let denied_always = [
            "about:blank#hash",
            "about:srcdoc",
            "https://example.com/",
            "http://example.com/",
            "https://tauri.localhost/",
            "https://localhost:5173/",
            "http://tauri.localhost.evil.com/",
            "http://evil.tauri.localhost/",
            "http://localhost.evil.com:5173/",
            "http://tauri.localhost:8080/",
            "tauri://localhost:5173/",
            "http://localhost/",
            "http://localhost:5174/",
            "http://127.0.0.1:3000/",
            "http://user@tauri.localhost/",
            "http://user:pass@tauri.localhost/",
            "http://:pass@tauri.localhost/",
            "http://user@localhost:5173/",
            "tauri://user@localhost/",
            "javascript:alert(1)",
            "file:///C:/Windows/win.ini",
            "data:text/html,<h1>blocked</h1>",
            "ftp://tauri.localhost/",
        ];

        for raw in denied_always {
            assert!(!allowed(raw, false), "prod should block {raw}");
            assert!(!allowed(raw, true), "dev should block {raw}");
        }
    }

    #[test]
    fn validates_blob_urls_recursively_and_rejects_nested_blobs() {
        assert!(allowed(
            "blob:http://tauri.localhost/550e8400-e29b-41d4-a716-446655440000",
            false
        ));
        assert!(allowed(
            "blob:tauri://localhost/550e8400-e29b-41d4-a716-446655440000",
            false
        ));
        assert!(!allowed(
            "blob:http://localhost:5173/550e8400-e29b-41d4-a716-446655440000",
            false
        ));
        assert!(allowed(
            "blob:http://localhost:5173/550e8400-e29b-41d4-a716-446655440000",
            true
        ));

        let denied_blobs = [
            "blob:blob:http://tauri.localhost/550e8400-e29b-41d4-a716-446655440000",
            "blob:https://example.com/550e8400-e29b-41d4-a716-446655440000",
            "blob:http://tauri.localhost.evil.com/550e8400-e29b-41d4-a716-446655440000",
            "blob:http://user@tauri.localhost/550e8400-e29b-41d4-a716-446655440000",
            "blob:about:blank",
            "blob:not-a-valid-url",
        ];

        for raw in denied_blobs {
            assert!(!allowed(raw, false), "prod should block {raw}");
            assert!(!allowed(raw, true), "dev should block {raw}");
        }
    }
}
