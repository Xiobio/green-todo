// Uses the real Windows shortcut manager and Tauri event loop, in a separate
// application profile. Run with: cargo run --example windows_smoke
#[path = "../src/hotkey.rs"]
mod hotkey;
#[path = "../src/storage.rs"]
mod storage;
#[allow(dead_code)]
#[path = "../src/tray_icon.rs"]
mod tray_icon;

#[cfg(windows)]
fn check(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::{Manager, tray::TrayIconBuilder};
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    // Exercise the same calls that used to execute synchronously in UI commands.
    hotkey::set(app, "Ctrl+Shift+F9")?;
    if !app.global_shortcut().is_registered("Ctrl+Shift+F9") { return Err("new key not registered".into()); }
    app.global_shortcut().register("Ctrl+Shift+F10").map_err(|e| e.to_string())?;
    if hotkey::set(app, "Ctrl+Shift+F10").is_ok() { return Err("conflict reported success".into()); }
    if app.state::<hotkey::HotkeyState>().0.lock().unwrap().as_deref() != Some("Ctrl+Shift+F9") {
        return Err("conflict lost old key".into());
    }
    if hotkey::set(app, "⌥Space").is_ok() { return Err("invalid key accepted".into()); }
    hotkey::set(app, "Ctrl+Shift+F11")?;
    if app.global_shortcut().is_registered("Ctrl+Shift+F9") || !app.global_shortcut().is_registered("Ctrl+Shift+F11") {
        return Err("key change did not update native registration".into());
    }
    let config_path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("green-todo-config.json");
    let saved: serde_json::Value = serde_json::from_slice(&std::fs::read(&config_path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    if saved["hotkey"] != "Ctrl+Shift+F11" { return Err("wrong persisted key".into()); }
    std::fs::write(&config_path, "[]").map_err(|e| e.to_string())?;
    hotkey::set(app, "Ctrl+Shift+F8")?; // Previously indexing this config panicked.

    let window = app.get_webview_window("main").ok_or("missing window")?;
    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.hide().map_err(|e| e.to_string())?;
    let tray = TrayIconBuilder::with_id("smoke").tooltip("Green Todo test").build(app).map_err(|e| e.to_string())?;
    tray.set_tooltip(Some("updated")).map_err(|e| e.to_string())?;
    for state in tray_icon::PET_STATES {
        let icon = tray_icon::render_pet_icon_for_state(state, 5, 3);
        tray.set_icon(Some(tauri::image::Image::new_owned(icon.data, icon.width, icon.height))).map_err(|e| e.to_string())?;
    }
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())?;
    println!("Windows native smoke passed: registration, conflict rollback, persistence, corrupt config, window and tray calls");
    Ok(())
}

#[cfg(windows)]
fn main() {
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = format!("com.xiobio.green-todo.smoke-{}", std::process::id());
    tauri::Builder::default()
        .manage(hotkey::HotkeyState::default())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_secs(30));
                eprintln!("Windows smoke timed out waiting for the native event loop");
                std::process::exit(1);
            });
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| check(&handle)));
                let code = match result {
                    Ok(Ok(())) => 0,
                    Ok(Err(error)) => { eprintln!("Windows smoke failed: {error}"); 1 }
                    Err(_) => { eprintln!("Windows smoke panicked"); 1 }
                };
                handle.exit(code);
            });
            Ok(())
        })
        .run(context)
        .expect("smoke runtime failed");
}

#[cfg(not(windows))]
fn main() {}
