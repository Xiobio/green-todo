use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tauri::image::Image;
use crate::tray_icon;

fn backup_path(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_default().join("todos-backup.json")
}

fn config_path(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_default().join("green-todo-config.json")
}

#[tauri::command]
pub fn update_tray_progress(app: tauri::AppHandle, total: u32, completed: u32) {
    let buf = tray_icon::render_pet_icon(total, completed);
    let img = Image::new_owned(buf.data, buf.width, buf.height);
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_icon(Some(img));
    }
}

#[tauri::command]
pub fn preview_pet_state(app: tauri::AppHandle, index: u32) {
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
pub fn backup_todos(app: tauri::AppHandle, json_string: String) {
    let path = backup_path(&app);
    let tmp = path.with_extension("json.tmp");
    if let Err(e) = fs::write(&tmp, &json_string) {
        eprintln!("[backup] write tmp failed: {e}");
        return;
    }
    if let Err(e) = fs::rename(&tmp, &path) {
        eprintln!("[backup] rename failed: {e}");
    }
}

#[tauri::command]
pub fn load_todos_backup(app: tauri::AppHandle) -> Option<String> {
    let path = backup_path(&app);
    match fs::read_to_string(&path) {
        Ok(data) => {
            // Validate it's a JSON array
            if serde_json::from_str::<Vec<serde_json::Value>>(&data).is_ok() {
                Some(data)
            } else {
                None
            }
        }
        Err(_) => None,
    }
}

#[tauri::command]
pub fn hide_window(window: tauri::Window) {
    let _ = window.hide();
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn toggle_always_on_top(window: tauri::Window) -> bool {
    use tauri::Emitter;
    let current = window.is_always_on_top().unwrap_or(false);
    let new_val = !current;
    let _ = window.set_always_on_top(new_val);
    let _ = window.emit("always-on-top-changed", new_val);
    new_val
}

#[tauri::command]
pub fn get_hotkey(app: tauri::AppHandle) -> String {
    let path = config_path(&app);
    if let Ok(data) = fs::read_to_string(&path) {
        if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&data) {
            if let Some(key) = cfg.get("hotkey").and_then(|v| v.as_str()) {
                return key.to_string();
            }
        }
    }
    "⌥Space".to_string()
}

#[tauri::command]
pub fn set_hotkey(app: tauri::AppHandle, key: String) -> serde_json::Value {
    let path = config_path(&app);
    let mut cfg: serde_json::Value = fs::read_to_string(&path)
        .ok()
        .and_then(|d| serde_json::from_str(&d).ok())
        .unwrap_or(serde_json::json!({}));
    cfg["hotkey"] = serde_json::json!(key);
    let _ = fs::write(&path, serde_json::to_string_pretty(&cfg).unwrap_or_default());
    serde_json::json!({ "success": true, "hotkey": key })
}

#[tauri::command]
pub async fn export_data(app: tauri::AppHandle, json_str: String) -> serde_json::Value {
    use tauri_plugin_dialog::DialogExt;
    let result = app.dialog()
        .file()
        .set_title("导出待办数据")
        .set_file_name(&format!("green-todo-backup-{}.json",
            chrono_free_date_str()))
        .add_filter("JSON", &["json"])
        .blocking_save_file();

    match result {
        Some(path) => {
            match fs::write(path.as_path().unwrap(), &json_str) {
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
            match fs::read_to_string(path.as_path().unwrap()) {
                Ok(data) => serde_json::json!({ "success": true, "data": data }),
                Err(e) => serde_json::json!({ "success": false, "error": e.to_string() }),
            }
        }
        None => serde_json::json!({ "success": false }),
    }
}

fn chrono_free_date_str() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    // Rough date: days since epoch → year-month-day approximation
    let days = secs / 86400;
    let y = 1970 + days / 365; // approximate
    let d = days % 365;
    let m = d / 30 + 1;
    let day = d % 30 + 1;
    format!("{}-{:02}-{:02}", y, m.min(12), day.min(28))
}
