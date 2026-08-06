//! Native OS menu bar for OpenWord.
//!
//! Every custom item emits a `menu:action` event and is backed by an explicit
//! Writer command or application workflow in `src/App.svelte`. Commands that
//! are not implemented in the single Writer engine are intentionally omitted
//! instead of opening placeholder dialogs.

use tauri::{
    menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    Emitter, Manager, Runtime,
};

pub fn build<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let item = |id: &str, label: &str, accelerator: Option<&str>| {
        let mut builder = MenuItemBuilder::with_id(id, label);
        if let Some(accelerator) = accelerator {
            builder = builder.accelerator(accelerator);
        }
        builder.build(app)
    };

    // On macOS the first submenu becomes the app menu regardless of label.
    let app_menu = SubmenuBuilder::new(app, "OpenWord")
        .item(&item("help_about", "About OpenWord", None)?)
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
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&item("edit_undo", "Undo", Some("CmdOrCtrl+Z"))?)
        .item(&item("edit_redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let insert_menu = SubmenuBuilder::new(app, "Insert")
        .item(&item("insert_page_break", "Page Break", Some("CmdOrCtrl+Return"))?)
        .build()?;

    let format_menu = SubmenuBuilder::new(app, "Format")
        .item(&item("format_bold", "Bold", Some("CmdOrCtrl+B"))?)
        .item(&item("format_italic", "Italic", Some("CmdOrCtrl+I"))?)
        .item(&item("format_underline", "Underline", Some("CmdOrCtrl+U"))?)
        .separator()
        .item(&item("format_align_left", "Align Left", Some("CmdOrCtrl+Shift+L"))?)
        .item(&item("format_align_center", "Center", Some("CmdOrCtrl+Shift+E"))?)
        .item(&item("format_align_right", "Align Right", Some("CmdOrCtrl+Shift+R"))?)
        .item(&item("format_align_justify", "Justify", Some("CmdOrCtrl+Shift+J"))?)
        .separator()
        .item(&item("format_bullet_list", "Bulleted List", Some("CmdOrCtrl+Shift+8"))?)
        .item(&item("format_ordered_list", "Numbered List", Some("CmdOrCtrl+Shift+7"))?)
        .build()?;

    let tools_menu = SubmenuBuilder::new(app, "Tools")
        .item(&item("tools_word_count", "Word Count", Some("CmdOrCtrl+Shift+C"))?)
        .build()?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&item("help_about", "About OpenWord", None)?)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&insert_menu)
        .item(&format_menu)
        .item(&tools_menu)
        .item(&help_menu)
        .build()
}

pub fn handle_event<R: Runtime>(app: &tauri::AppHandle<R>, event_id: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("menu:action", event_id);
    }
}
