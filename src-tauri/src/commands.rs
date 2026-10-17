use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri::image::Image;
use crate::tray_icon;

#[tauri::command]
pub async fn report_client_error(message: String) {
    crate::diagnostics::record(&format!("renderer: {message}"));
}

fn backup_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("todos-backup.json"))
}

#[tauri::command]
pub async fn update_tray_progress(app: tauri::AppHandle, total: u32, completed: u32) {
    let buf = tray_icon::render_pet_icon(total, completed);
    let img = Image::new_owned(buf.data, buf.width, buf.height);
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_icon(Some(img));
    }
}

#[tauri::command]
pub async fn preview_pet_state(app: tauri::AppHandle, index: u32) {
    let states = tray_icon::PET_STATES;
    let state = &states[(index as usize) % states.len()];
    let buf = tray_icon::render_pet_icon_for_state(state, 5, (index as u32).min(5));
    let img = Image::new_owned(buf.data, buf.width, buf.height);
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_icon(Some(img));
    }
}

/// Atomic write: write to .tmp then rename
#[tauri::command]
pub async fn backup_todos(app: tauri::AppHandle, json_string: String) -> Result<(), String> {
    serde_json::from_str::<Vec<serde_json::Value>>(&json_string).map_err(|_| "备份数据格式错误")?;
    let state = app.state::<crate::storage::StorageLock>();
    let _guard = state.0.lock().map_err(|_| "备份状态不可用")?;
    crate::storage::atomic_write(&backup_path(&app)?, json_string.as_bytes())
}

#[tauri::command]
pub async fn load_todos_backup(app: tauri::AppHandle) -> Result<Option<String>, String> {
    match fs::read_to_string(backup_path(&app)?) {
        Ok(data) => {
            // Validate it's a JSON array
            if serde_json::from_str::<Vec<serde_json::Value>>(&data).is_ok() {
                Ok(Some(data))
            } else {
                Err("备份文件格式错误".into())
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn hide_window(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn toggle_always_on_top(window: tauri::Window) -> Result<bool, String> {
    use tauri::Emitter;
    let current = window.is_always_on_top().unwrap_or(false);
    let new_val = !current;
    window.set_always_on_top(new_val).map_err(|e| e.to_string())?;
    let _ = window.emit("always-on-top-changed", new_val);
    Ok(new_val)
}

#[tauri::command]
pub async fn get_hotkey(app: tauri::AppHandle) -> Option<String> {
    app.state::<crate::hotkey::HotkeyState>().0.lock().ok()?.clone()
}

#[tauri::command]
pub async fn set_hotkey(app: tauri::AppHandle, key: String) -> serde_json::Value {
    match crate::hotkey::set(&app, &key) {
        Ok(hotkey) => serde_json::json!({ "success": true, "hotkey": hotkey }),
        Err(error) => serde_json::json!({ "success": false, "error": error, "hotkey": get_hotkey(app).await }),
    }
}

#[tauri::command]
pub async fn export_data(app: tauri::AppHandle, json_str: String) -> serde_json::Value {
    use tauri_plugin_dialog::DialogExt;
    let result = app.dialog()
        .file()
        .set_title("导出待办数据")
        .set_file_name(&format!("green-todo-backup-{}.json",
            chrono::Local::now().format("%Y-%m-%d")))
        .add_filter("JSON", &["json"])
        .blocking_save_file();

    match result {
        Some(path) => {
            let Some(path) = path.as_path() else {
                return serde_json::json!({ "success": false, "error": "请选择本地文件" });
            };
            match crate::storage::atomic_write(path, json_str.as_bytes()) {
                Ok(_) => serde_json::json!({ "success": true }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        None => serde_json::json!({ "success": false }),
    }
}

#[tauri::command]
pub async fn import_data(app: tauri::AppHandle) -> serde_json::Value {
    use tauri_plugin_dialog::DialogExt;
    let result = app.dialog()
        .file()
        .set_title("导入待办数据")
        .add_filter("JSON", &["json"])
        .blocking_pick_file();

    match result {
        Some(path) => {
            let Some(path) = path.as_path() else {
                return serde_json::json!({ "success": false, "error": "请选择本地文件" });
            };
            match fs::read_to_string(path) {
                Ok(data) => serde_json::json!({ "success": true, "data": data }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        None => serde_json::json!({ "success": false }),
    }
}
