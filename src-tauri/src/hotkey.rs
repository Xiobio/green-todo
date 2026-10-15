use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

#[derive(Default)]
pub struct HotkeyState(pub Mutex<Option<String>>);

pub fn default_key() -> &'static str {
    if cfg!(target_os = "macos") { "Alt+Space" } else { "Ctrl+Space" }
}

pub fn parse_key(key: &str) -> Result<Shortcut, String> {
    let shortcut: Shortcut = key.parse().map_err(|_| "无效的快捷键组合".to_string())?;
    if shortcut.mods.is_empty() {
        return Err("快捷键需要包含 Ctrl、Alt、Shift 或 Win/Cmd".into());
    }
    Ok(shortcut)
}

// Keep the old registration until both the new registration and configuration
// save succeed. A conflict or disk error must not leave the app unreachable.
fn change_registration(
    current: &mut Option<String>,
    key: &str,
    mut register: impl FnMut(&str) -> Result<(), String>,
    mut unregister: impl FnMut(&str) -> Result<(), String>,
    mut persist: impl FnMut(&str) -> Result<(), String>,
) -> Result<(), String> {
    let next = parse_key(key)?;
    if current.as_deref().and_then(|s| parse_key(s).ok()) == Some(next) {
        return Ok(());
    }
    register(key)?;
    if let Err(error) = persist(key) {
        let _ = unregister(key);
        return Err(error);
    }
    if let Some(old) = current.as_deref() {
        if let Err(error) = unregister(old) {
            let _ = unregister(key);
            let _ = persist(old);
            return Err(error);
        }
    }
    *current = Some(key.into());
    Ok(())
}

pub fn set(app: &AppHandle, key: &str) -> Result<String, String> {
    let state = app.state::<HotkeyState>();
    let mut current = state.0.lock().map_err(|_| "快捷键状态不可用")?;
    change_registration(
        &mut current,
        key,
        |key| app.global_shortcut().register(key).map_err(|e| format!("快捷键已被占用或无法注册：{e}")),
        |key| app.global_shortcut().unregister(key).map_err(|e| e.to_string()),
        |key| {
            let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("green-todo-config.json");
            let mut config = std::fs::read(&path).ok()
                .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
                .filter(|value| value.is_object())
                .unwrap_or_else(|| serde_json::json!({}));
            config["hotkey"] = serde_json::json!(key);
            crate::storage::atomic_write(&path, &serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?)
        },
    )?;
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(format!("Green Todo - {key}")));
    }
    Ok(key.into())
}

pub fn initialize(app: &AppHandle) {
    let saved = app.path().app_data_dir().ok()
        .and_then(|dir| std::fs::read(dir.join("green-todo-config.json")).ok())
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
        .and_then(|cfg| cfg.get("hotkey").and_then(|v| v.as_str()).map(str::to_owned));
    let fallback = if cfg!(target_os = "macos") { "Cmd+Alt+T" } else { "Ctrl+Alt+T" };
    for key in [saved.as_deref().unwrap_or(default_key()), default_key(), fallback] {
        if set(app, key).is_ok() { return; }
    }
    eprintln!("[hotkey] No available global shortcut; use the tray to open settings");
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some("Green Todo - 快捷键注册失败，请在设置中更换"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn platform_default_is_parseable_and_mac_symbol_is_rejected() {
        assert!(parse_key(default_key()).is_ok());
        assert!(parse_key("⌥Space").is_err());
        assert!(parse_key("T").is_err());
        for key in ["Ctrl+Shift+T", "Ctrl+Up", "Ctrl+Plus", "Super+T"] {
            assert!(parse_key(key).is_ok(), "{key}");
        }
    }

    #[test]
    fn conflict_keeps_previous_shortcut() {
        let mut current = Some("Ctrl+Space".into());
        change_registration(&mut current, "Ctrl+Shift+T", |_| Err("busy".into()), |_| panic!("must retain old key"), |_| panic!("must not save")).unwrap_err();
        assert_eq!(current.as_deref(), Some("Ctrl+Space"));
    }

    #[test]
    fn disk_failure_removes_new_key_and_keeps_old_key() {
        let mut current = Some("Ctrl+Space".into());
        let removed = RefCell::new(Vec::new());
        change_registration(&mut current, "Ctrl+Shift+T", |_| Ok(()), |key| { removed.borrow_mut().push(key.to_string()); Ok(()) }, |_| Err("disk full".into())).unwrap_err();
        assert_eq!(current.as_deref(), Some("Ctrl+Space"));
        assert_eq!(*removed.borrow(), vec!["Ctrl+Shift+T"]);
    }

    #[test]
    fn successful_change_registers_and_saves_before_removing_old_key() {
        let mut current = Some("Ctrl+Space".into());
        let calls = RefCell::new(Vec::new());
        change_registration(&mut current, "Ctrl+Shift+T", |_| { calls.borrow_mut().push("register"); Ok(()) }, |_| { calls.borrow_mut().push("unregister"); Ok(()) }, |_| { calls.borrow_mut().push("save"); Ok(()) }).unwrap();
        assert_eq!(current.as_deref(), Some("Ctrl+Shift+T"));
        assert_eq!(*calls.borrow(), vec!["register", "save", "unregister"]);
    }
}
