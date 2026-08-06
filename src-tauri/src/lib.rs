mod menu;

use tauri::{Emitter, Manager};

fn is_supported_document_path(path: &str) -> bool {
    matches!(
        std::path::Path::new(path)
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some("docx" | "odt" | "owdoc")
    )
}

/// Files passed on the command line (double-click / "Open with" on
/// Windows and Linux) arrive as argv, not as a native "open file" event.
fn extract_doc_paths(argv: &[String]) -> Vec<String> {
    argv.iter()
        .skip(1)
        .filter(|argument| is_supported_document_path(argument))
        .cloned()
        .collect()
}

fn emit_open_paths(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
        let _ = window.emit("file:open-path", paths);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = extract_doc_paths(&argv);
            emit_open_paths(app, paths);
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let menu = menu::build(app.handle())?;
            app.set_menu(menu)?;

            let argv: Vec<String> = std::env::args().collect();
            let paths = extract_doc_paths(&argv);
            if !paths.is_empty() {
                let handle = app.handle().clone();
                emit_open_paths(&handle, paths);
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            menu::handle_event(app, event.id().0.as_str());
        })
        .build(tauri::generate_context!())
        .expect("error while building the OpenWord application")
        .run(|_app_handle, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let paths: Vec<String> = urls
                    .into_iter()
                    .filter_map(|url: tauri::Url| url.to_file_path().ok())
                    .map(|path: std::path::PathBuf| path.to_string_lossy().to_string())
                    .filter(|path| is_supported_document_path(path))
                    .collect();
                emit_open_paths(_app_handle, paths);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::{extract_doc_paths, is_supported_document_path};

    #[test]
    fn recognizes_writer_documents_case_insensitively() {
        assert!(is_supported_document_path("Report.DOCX"));
        assert!(is_supported_document_path("notes.odt"));
        assert!(is_supported_document_path("legacy.owdoc"));
    }

    #[test]
    fn rejects_unverified_formats() {
        assert!(!is_supported_document_path("report.pdf"));
        assert!(!is_supported_document_path("README"));
        assert!(!is_supported_document_path("draft.rtf"));
    }

    #[test]
    fn extracts_only_document_arguments() {
        let argv = vec![
            "openword".to_string(),
            "one.docx".to_string(),
            "two.odt".to_string(),
            "ignored.pdf".to_string(),
        ];
        assert_eq!(extract_doc_paths(&argv), vec!["one.docx", "two.odt"]);
    }
}
