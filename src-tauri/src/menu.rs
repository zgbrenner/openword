//! Native OS menu bar for OpenWord.
//!
//! The menu is intentionally "dumb": every custom item just emits a
//! `menu:action` event with its id as payload, and the frontend decides what
//! to do with it. This keeps all editing logic in one place (the editor
//! module) instead of splitting it between Rust and TypeScript.

use tauri::{
    menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    Emitter, Manager, Runtime,
};

pub fn build<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let item = |id: &str, label: &str, accelerator: Option<&str>| {
        let mut b = MenuItemBuilder::with_id(id, label);
        if let Some(acc) = accelerator {
            b = b.accelerator(acc);
        }
        b.build(app)
    };

    // On macOS the first submenu becomes the app menu regardless of label.
    let app_menu = SubmenuBuilder::new(app, "OpenWord")
        .item(&item("help_about", "About OpenWord", None)?)
        .separator()
        .item(&item("app_preferences", "Preferences...", Some("CmdOrCtrl+,"))?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&item("file_new", "New", Some("CmdOrCtrl+N"))?)
        .item(&item("file_open", "Open...", Some("CmdOrCtrl+O"))?)
        .separator()
        .item(&item("file_save", "Save", Some("CmdOrCtrl+S"))?)
        .item(&item("file_save_as", "Save As...", Some("CmdOrCtrl+Shift+S"))?)
        .item(&item("file_export_pdf", "Export as PDF...", None)?)
        .separator()
        .item(&item("file_print", "Print...", Some("CmdOrCtrl+P"))?)
        .separator()
        .item(&item("file_close", "Close", Some("CmdOrCtrl+W"))?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&item("edit_undo", "Undo", Some("CmdOrCtrl+Z"))?)
        .item(&item("edit_redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&item("edit_paste_without_formatting", "Paste without formatting", Some("CmdOrCtrl+Shift+V"))?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&item("edit_find", "Find...", Some("CmdOrCtrl+F"))?)
        .item(&item("edit_find_replace", "Find and replace...", Some("CmdOrCtrl+H"))?)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&item("view_zoom_in", "Zoom In", Some("CmdOrCtrl+Plus"))?)
        .item(&item("view_zoom_out", "Zoom Out", Some("CmdOrCtrl+-"))?)
        .item(&item("view_zoom_reset", "Actual Size", Some("CmdOrCtrl+0"))?)
        .separator()
        .item(&item("view_toggle_ruler", "Show Ruler", None)?)
        .build()?;

    let insert_menu = SubmenuBuilder::new(app, "Insert")
        .item(&item("insert_image", "Image...", None)?)
        .item(&item("insert_table", "Table...", None)?)
        .item(&item("insert_link", "Link...", Some("CmdOrCtrl+K"))?)
        .item(&item("insert_comment", "Comment", Some("CmdOrCtrl+Alt+M"))?)
        .item(&item("insert_page_break", "Page break", Some("CmdOrCtrl+Return"))?)
        .build()?;

    let format_menu = SubmenuBuilder::new(app, "Format")
        .item(&item("format_bold", "Bold", Some("CmdOrCtrl+B"))?)
        .item(&item("format_italic", "Italic", Some("CmdOrCtrl+I"))?)
        .item(&item("format_underline", "Underline", Some("CmdOrCtrl+U"))?)
        .item(&item("format_strikethrough", "Strikethrough", None)?)
        .separator()
        .item(&item("format_align_left", "Align left", Some("CmdOrCtrl+Shift+L"))?)
        .item(&item("format_align_center", "Align center", Some("CmdOrCtrl+Shift+E"))?)
        .item(&item("format_align_right", "Align right", Some("CmdOrCtrl+Shift+R"))?)
        .item(&item("format_align_justify", "Justify", Some("CmdOrCtrl+Shift+J"))?)
        .separator()
        .item(&item("format_bullet_list", "Bulleted list", Some("CmdOrCtrl+Shift+8"))?)
        .item(&item("format_ordered_list", "Numbered list", Some("CmdOrCtrl+Shift+7"))?)
        .separator()
        .item(&item("format_clear", "Clear formatting", Some("CmdOrCtrl+\\"))?)
        .build()?;

    let tools_menu = SubmenuBuilder::new(app, "Tools")
        .item(&item("tools_word_count", "Word count", Some("CmdOrCtrl+Shift+C"))?)
        .item(&item("tools_spelling", "Spelling and grammar", None)?)
        .separator()
        .item(&item("tools_track_changes", "Track changes", None)?)
        .item(&item("tools_accept_all_changes", "Accept all changes", None)?)
        .item(&item("tools_reject_all_changes", "Reject all changes", None)?)
        .separator()
        .item(&item("tools_set_author_name", "Set your name...", None)?)
        .build()?;

    let table_menu = SubmenuBuilder::new(app, "Table")
        .item(&item("table_insert_row_below", "Insert row below", None)?)
        .item(&item("table_insert_column_right", "Insert column right", None)?)
        .item(&item("table_delete_row", "Delete row", None)?)
        .item(&item("table_delete_column", "Delete column", None)?)
        .item(&item("table_delete", "Delete table", None)?)
        .build()?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&item("help_shortcuts", "Keyboard shortcuts", None)?)
        .item(&item("help_about", "About OpenWord", None)?)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&insert_menu)
        .item(&format_menu)
        .item(&tools_menu)
        .item(&table_menu)
        .item(&help_menu)
        .build()
}

pub fn handle_event<R: Runtime>(app: &tauri::AppHandle<R>, event_id: &str) {
    // Forward every menu id straight to the frontend; it owns the logic.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("menu:action", event_id);
    }
}
