mod menu;

use tauri::{Emitter, Manager};

fn is_supported_document_path(path: &str) -> bool {
    matches!(
        std::path::Path::new(path)
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some("docx" | "owdoc")
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

// --- Documents asked for before the webview exists ---------------------------
//
// `setup()` runs before the page is loaded, so a cold start's argv paths would
// be emitted at a window whose `file:open-path` listener is not registered yet
// and the launch document would be silently dropped. Every delivery is
// therefore buffered here as well as emitted: a running window takes the
// event, a starting one drains the buffer as soon as it mounts.

#[derive(Default)]
struct PendingOpenPaths(std::sync::Mutex<Vec<String>>);

/// Hands the frontend every document path the shell has been asked to open so
/// far and empties the buffer, so a path is opened exactly once.
#[tauri::command]
fn take_pending_open_paths(pending: tauri::State<'_, PendingOpenPaths>) -> Vec<String> {
    let mut buffered = pending.0.lock().unwrap_or_else(|error| error.into_inner());
    std::mem::take(&mut *buffered)
}

fn deliver_open_paths(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Some(pending) = app.try_state::<PendingOpenPaths>() {
        let mut buffered = pending.0.lock().unwrap_or_else(|error| error.into_inner());
        buffered.extend(paths.iter().cloned());
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
        let _ = window.emit("file:open-path", paths);
    }
}

// --- Atomic document replacement ---------------------------------------------
//
// The staged write lives here rather than in the frontend because the dialog
// plugin only ever grants the exact file the user picked, and the filesystem
// plugin rejects every path outside the static `fs:scope` allow-list. The
// sibling `.openword-tmp-*` and `.openword-backup-*` paths a staged
// replacement needs are granted by neither, so a document on any drive but
// `$HOME`, `$DOCUMENT` or `$APPDATA` could not be saved at all.
//
// Running the sequence here also keeps the staged file in the target's own
// directory, which is the only way the final rename is guaranteed to stay on
// one volume: `std::fs::rename` is `MoveFileExW` without
// `MOVEFILE_COPY_ALLOWED` and fails outright across volumes.

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentReplaceResult {
    retained_backup_path: Option<String>,
}

fn operation_token() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since_epoch| since_epoch.as_nanos())
        .unwrap_or(0);
    format!("{}-{}", std::process::id(), nanos)
}

/// Reverses `encodeURIComponent`, which is how the frontend keeps a path with
/// non-ASCII characters inside an IPC header value.
fn decode_percent_encoding(encoded: &str) -> Option<String> {
    let source = encoded.as_bytes();
    let mut decoded: Vec<u8> = Vec::with_capacity(source.len());
    let mut index = 0;
    while index < source.len() {
        if source[index] == b'%' && index + 2 < source.len() {
            let high = char::from(source[index + 1]).to_digit(16)?;
            let low = char::from(source[index + 2]).to_digit(16)?;
            decoded.push((high * 16 + low) as u8);
            index += 3;
        } else {
            decoded.push(source[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

fn write_staged_file(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut file = std::fs::File::create(path)?;
    file.write_all(bytes)?;
    // The rename below must publish a complete file even if the machine loses
    // power immediately afterwards.
    file.sync_all()
}

/// Windows refuses to delete a file carrying the read-only attribute, while
/// Unix permissions never block deletion at all — so this is a Windows-only
/// step.
#[cfg(windows)]
fn clear_read_only_attribute(path: &std::path::Path) -> std::io::Result<()> {
    let mut permissions = std::fs::metadata(path)?.permissions();
    if !permissions.readonly() {
        return Ok(());
    }
    // Windows has no world-writable bit: this clears FILE_ATTRIBUTE_READONLY,
    // which is exactly what is blocking the delete.
    #[allow(clippy::permissions_set_readonly_false)]
    permissions.set_readonly(false);
    std::fs::set_permissions(path, permissions)
}

/// Saving over a read-only document succeeds (the rename that sets the
/// original aside is allowed), so the backup left behind is read-only too.
/// Clear the attribute rather than reporting a retained backup the user never
/// asked for.
fn remove_file_even_if_read_only(path: &std::path::Path) -> std::io::Result<()> {
    let first_error = match std::fs::remove_file(path) {
        Ok(()) => return Ok(()),
        Err(error) => error,
    };
    #[cfg(windows)]
    if clear_read_only_attribute(path).is_ok() {
        return std::fs::remove_file(path);
    }
    Err(first_error)
}

/// Writes the complete new document beside the target before touching the
/// original, then swaps the two with renames inside a single directory. A
/// failed replacement restores the original when possible and deliberately
/// retains the staged file so the new bytes remain recoverable. On success the
/// backup is removed, and its path is reported back only when it could not be.
fn replace_file_atomically(
    target: &std::path::Path,
    bytes: &[u8],
) -> Result<Option<String>, String> {
    let file_name = target
        .file_name()
        .ok_or_else(|| format!("{} is not a file path.", target.display()))?;
    let directory = match target.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => std::path::Path::new("."),
    };

    let token = operation_token();
    let mut staged_name = file_name.to_os_string();
    staged_name.push(format!(".openword-tmp-{}", token));
    let staged = directory.join(staged_name);

    let mut backup_name = file_name.to_os_string();
    backup_name.push(format!(".openword-backup-{}", token));
    let backup = directory.join(backup_name);

    if let Err(error) = write_staged_file(&staged, bytes) {
        let _ = std::fs::remove_file(&staged);
        return Err(format!(
            "Could not write the new document beside {}. {}",
            target.display(),
            error
        ));
    }

    // Renaming is also the existence check: a Save As to a new path reports
    // `NotFound` here and simply has no previous file to preserve.
    let had_original = match std::fs::rename(target, &backup) {
        Ok(()) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => {
            let _ = std::fs::remove_file(&staged);
            return Err(format!(
                "Could not set the previous {} aside before saving. {}",
                target.display(),
                error
            ));
        }
    };

    if let Err(error) = std::fs::rename(&staged, target) {
        if had_original && !target.exists() {
            let _ = std::fs::rename(&backup, target);
        }
        return Err(format!(
            "Could not replace {}. New document bytes remain at {}. {}",
            target.display(),
            staged.display(),
            error
        ));
    }

    if had_original && remove_file_even_if_read_only(&backup).is_err() {
        // The target is saved correctly. Retain the old file and report its
        // location instead of turning successful persistence into an error.
        return Ok(Some(backup.to_string_lossy().to_string()));
    }
    Ok(None)
}

/// Replaces the document at the `path` header with the raw request body.
///
/// The bytes travel as a raw IPC body — the same shape `plugin:fs|write_file`
/// uses — so a multi-megabyte document is not re-encoded as a JSON array of
/// numbers on its way across the bridge.
#[tauri::command]
async fn replace_document_atomically(
    request: tauri::ipc::Request<'_>,
) -> Result<DocumentReplaceResult, String> {
    let encoded_path = request
        .headers()
        .get("path")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "The save request carried no target path.".to_string())?;
    let path = decode_percent_encoding(encoded_path)
        .ok_or_else(|| "The save request target path was not valid UTF-8.".to_string())?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(raw) => raw.as_slice(),
        tauri::ipc::InvokeBody::Json(_) => {
            return Err("The save request carried no document bytes.".to_string())
        }
    };

    Ok(DocumentReplaceResult {
        retained_backup_path: replace_file_atomically(std::path::Path::new(&path), bytes)?,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = extract_doc_paths(&argv);
            deliver_open_paths(app, paths);
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingOpenPaths::default())
        // Commands the application defines itself, as opposed to plugin
        // commands, are not gated by the capability ACL while the crate ships
        // no application permission manifest (no `src-tauri/permissions`
        // directory and no `AppManifest::commands` in `build.rs`). Adding
        // either would make these two need explicit `allow-*` entries in
        // `capabilities/default.json`.
        .invoke_handler(tauri::generate_handler![
            replace_document_atomically,
            take_pending_open_paths
        ])
        .setup(|app| {
            let menu = menu::build(app.handle())?;
            app.set_menu(menu)?;

            let argv: Vec<String> = std::env::args().collect();
            let paths = extract_doc_paths(&argv);
            if !paths.is_empty() {
                let handle = app.handle().clone();
                deliver_open_paths(&handle, paths);
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
                deliver_open_paths(_app_handle, paths);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::{
        decode_percent_encoding, extract_doc_paths, is_supported_document_path,
        remove_file_even_if_read_only, replace_file_atomically,
    };

    fn temp_directory(name: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|since_epoch| since_epoch.as_nanos())
            .unwrap_or(0);
        let directory = std::env::temp_dir().join(format!("openword-{}-{}", name, nanos));
        std::fs::create_dir_all(&directory).expect("create the test directory");
        directory
    }

    fn entry_names(directory: &std::path::Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(directory)
            .expect("read the test directory")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn recognizes_editor_documents_case_insensitively() {
        assert!(is_supported_document_path("Report.DOCX"));
        assert!(is_supported_document_path("legacy.owdoc"));
    }

    #[test]
    fn rejects_unverified_formats() {
        assert!(!is_supported_document_path("report.pdf"));
        assert!(!is_supported_document_path("README"));
        assert!(!is_supported_document_path("draft.rtf"));
        // The shipping editor cannot open ODT and the file association is gone.
        assert!(!is_supported_document_path("notes.odt"));
    }

    #[test]
    fn extracts_only_document_arguments() {
        let argv = vec![
            "openword".to_string(),
            "one.docx".to_string(),
            "two.odt".to_string(),
            "ignored.pdf".to_string(),
            "three.owdoc".to_string(),
        ];
        assert_eq!(extract_doc_paths(&argv), vec!["one.docx", "three.owdoc"]);
    }

    #[test]
    fn decodes_the_paths_the_frontend_encodes() {
        assert_eq!(
            decode_percent_encoding("D%3A%5Cwork%5Creport.docx").as_deref(),
            Some("D:\\work\\report.docx")
        );
        // encodeURIComponent leaves these alone.
        assert_eq!(
            decode_percent_encoding("/home/u/notes.owdoc").as_deref(),
            Some("/home/u/notes.owdoc")
        );
        assert_eq!(
            decode_percent_encoding("C%3A%5C%C3%9Cbersicht.docx").as_deref(),
            Some("C:\\Übersicht.docx")
        );
        assert_eq!(decode_percent_encoding("%zz"), None);
    }

    #[test]
    fn save_as_to_a_new_path_writes_the_document_and_keeps_no_backup() {
        let directory = temp_directory("save-as");
        let target = directory.join("New Document.docx");

        let retained = replace_file_atomically(&target, b"first").expect("save to a new path");

        assert_eq!(retained, None);
        assert_eq!(std::fs::read(&target).expect("read back"), b"first");
        assert_eq!(entry_names(&directory), vec!["New Document.docx"]);
        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn replacing_an_existing_document_leaves_no_staged_or_backup_files_behind() {
        let directory = temp_directory("replace");
        let target = directory.join("Report.docx");
        std::fs::write(&target, b"old bytes").expect("seed the target");

        let retained = replace_file_atomically(&target, b"new bytes").expect("replace the target");

        assert_eq!(retained, None);
        assert_eq!(std::fs::read(&target).expect("read back"), b"new bytes");
        assert_eq!(entry_names(&directory), vec!["Report.docx"]);
        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn a_read_only_target_is_replaced_and_its_backup_still_cleaned_up() {
        let directory = temp_directory("read-only");
        let target = directory.join("Locked.docx");
        std::fs::write(&target, b"old bytes").expect("seed the target");
        let mut permissions = std::fs::metadata(&target)
            .expect("read the seeded permissions")
            .permissions();
        permissions.set_readonly(true);
        std::fs::set_permissions(&target, permissions).expect("make the target read-only");

        let retained =
            replace_file_atomically(&target, b"new bytes").expect("replace a read-only target");

        assert_eq!(retained, None);
        assert_eq!(std::fs::read(&target).expect("read back"), b"new bytes");
        assert_eq!(entry_names(&directory), vec!["Locked.docx"]);
        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn read_only_files_are_removable_and_a_missing_file_is_still_an_error() {
        let directory = temp_directory("remove");
        let path = directory.join("Locked.docx");
        std::fs::write(&path, b"bytes").expect("seed the file");
        let mut permissions = std::fs::metadata(&path)
            .expect("read the seeded permissions")
            .permissions();
        permissions.set_readonly(true);
        std::fs::set_permissions(&path, permissions).expect("make the file read-only");

        assert!(remove_file_even_if_read_only(&path).is_ok());
        assert!(remove_file_even_if_read_only(&path).is_err());
        let _ = std::fs::remove_dir_all(&directory);
    }
}
