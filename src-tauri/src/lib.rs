mod menu;

use tauri::{Emitter, Manager};

/// Files passed on the command line (double-click / "Open with" on
/// Windows and Linux) arrive as argv, not as a native "open file" event.
/// Extract anything that looks like a document path.
fn extract_doc_paths(argv: &[String]) -> Vec<String> {
    argv.iter()
        .skip(1)
        .filter(|arg| {
            let lower = arg.to_lowercase();
            lower.ends_with(".docx") || lower.ends_with(".owdoc")
        })
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
            // A second launch (e.g. double-clicking another .docx while
            // OpenWord is already running) hands its args to the running
            // instance instead of opening a second window.
            let paths = extract_doc_paths(&argv);
            emit_open_paths(app, paths);
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let menu = menu::build(app.handle())?;
            app.set_menu(menu)?;

            // Linux/Windows cold start with a file argument.
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
            // macOS/iOS deliver "open with" as a native run event instead of argv.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let paths: Vec<String> = urls
                    .into_iter()
                    .filter_map(|url: tauri::Url| url.to_file_path().ok())
                    .map(|p: std::path::PathBuf| p.to_string_lossy().to_string())
                    .collect();
                emit_open_paths(_app_handle, paths);
            }
        });
}
